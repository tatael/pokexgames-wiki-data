import { cleanStructuredText, normalizeIdToken, stripImageRefFromText } from "./text.mjs";

const HELD_NAME_PATTERN = /\b[XY]-[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*)?\b/g;
const HELD_DESCRIPTION_START = /^(?:Increases|Grants|Returns|Reduces|Regenerates|Updates|Pokémon|Pokemon|Your|The|No)$/i;

export function isHeldCategoriesSection(normalizedId, normalizedHeading, pageCategory) {
	return pageCategory === "held items"
		&& (
			["categories", "categorias"].includes(normalizedId)
			|| ["categories", "categorias"].includes(normalizedHeading)
		);
}

export function parseHeldCategoryGroups(paragraphs = []) {
	const groups = [];
	let currentGroup = null;
	for (const paragraph of paragraphs) {
		const text = String(paragraph ?? "").trim();
		if (!text) continue;
		const heading = text.match(/^#\s+(.+)/);
		if (heading) {
			currentGroup = {
				name: cleanStructuredText(heading[1]),
				entries: [],
			};

			groups.push(currentGroup);
			continue;
		}

		const entries = parseHeldStatEntries(text, 9);
		if (!entries.length) continue;
		if (!currentGroup) {
			currentGroup = { name: "Held Items", entries: [] };
			groups.push(currentGroup);
		}

		currentGroup.entries.push(...entries);
	}

	return { groups: groups.filter((group) => group.entries.length) };
}

export function isHeldBoostSection(normalizedId, normalizedHeading, pageCategory) {
	return pageCategory === "held items"
		&& (
			normalizedId === "information about x boost"
			|| normalizedId === "informacoes sobre o x boost"
			|| normalizedHeading === "information about x boost"
			|| normalizedHeading === "informacoes sobre o x boost"
	);
}

export function isHeldDetailsSection(normalizedId, normalizedHeading, pageCategory) {
	return pageCategory === "held items"
		&& (
			normalizedId === "specific details"
			|| normalizedId === "detalhes especificos"
			|| normalizedHeading === "specific details"
			|| normalizedHeading === "detalhes especificos"
		);
}

export function parseHeldDetails(paragraphs = [], items = []) {
	const intro = [];
	const entries = [];
	for (const raw of [...paragraphs, ...items]) {
		const text = cleanStructuredText(raw);
		if (!text) continue;
		const match = text.match(/^([XY]-[A-Za-z][A-Za-z-\s]*?):\s*(.+)$/);
		if (!match) {
			intro.push(text);
			continue;
		}

		entries.push({
			name: cleanStructuredText(match[1]),
			value: cleanStructuredText(match[2]),
		});
	}

	return { intro, entries };
}

export function parseHeldBoostGroups(paragraphs = []) {
	const ranges = [];
	const utilities = [];
	let currentTitle = "";
	for (const paragraph of paragraphs) {
		const text = String(paragraph ?? "").trim();
		if (!text) continue;
		const heading = text.match(/^#\s+(.+)/);
		if (heading) {
			currentTitle = cleanStructuredText(heading[1]);
			continue;
		}

		if (/^(level range|faixa de nivel)\s+boost\b/i.test(normalizeIdToken(text))) {
			const rows = parseHeldBoostRangeRows(text);
			if (rows.length) {
				ranges.push({
					name: currentTitle || `Tier ${ranges.length + 1}`,
					rows,
				});
			}

			continue;
		}

		const entries = parseHeldStatEntries(text, /utility y/i.test(currentTitle) ? 7 : 9);
		if (entries.length) {
			utilities.push({
				name: currentTitle || `Grupo ${utilities.length + 1}`,
				entries,
			});
		}
	}

	return {
		ranges,
		utilities,
	};
}

const HELD_OPERATION_IDS = new Set([
	"como equipar em seu pokemon",
	"como remover um held item de seu pokemon",
	"como equipar um held item em seu device",
	"como remover um held item de seu device",
	"fusao de held item",
]);

export function parseHeldOperationSteps(normalizedId, paragraphs = [], items = []) {
	if (!HELD_OPERATION_IDS.has(normalizedId)) return [];

	const cleanParagraphs = paragraphs.map(cleanStructuredText).filter(Boolean);
	const cleanItems = items.map(cleanStructuredText).filter(Boolean);

	if (normalizedId === "como equipar em seu pokemon") {
		return compactHeldSteps([{
			index: 1,
			title: "Equipar no PokÃ©mon",
			body: cleanParagraphs.length ? [cleanParagraphs[0]] : [],
			bullets: [
				...cleanParagraphs.slice(2),
				...cleanItems,
			],
		}]);
	}

	if (normalizedId === "como remover um held item de seu pokemon") {
		return compactHeldSteps([{
			index: 1,
			title: "Remover no PokÃ©mon",
			body: cleanParagraphs,
			rows: parseHeldPipeRows(cleanItems),
		}]);
	}

	if (normalizedId === "como equipar um held item em seu device") {
		const improvedDeviceText = cleanParagraphs[2]
			? cleanParagraphs[2].replace(/^Como colocar o Held Item no Improved Device\s*/i, "").trim()
			: "";
		return compactHeldSteps([
			{
				index: 1,
				title: "Equipar no Device",
				body: cleanParagraphs[0] ? [cleanParagraphs[0]] : [],
				bullets: cleanParagraphs[1] ? [cleanParagraphs[1]] : [],
			},
			{
				index: 2,
				title: "Improved Device",
				body: improvedDeviceText ? [improvedDeviceText] : [],
				rows: parseHeldPipeRows(cleanItems),
			},
		]);
	}

	if (normalizedId === "como remover um held item de seu device") {
		const modeNotes = cleanItems.filter((item) => !item.includes("|"));
		const costRows = parseHeldPipeRows(cleanItems);
		return compactHeldSteps([{
			index: 1,
			title: "Remover no Device",
			body: cleanParagraphs,
			bullets: modeNotes,
			rows: costRows,
		}]);
	}

	if (normalizedId === "fusao de held item") {
		const costItems = cleanItems.filter((item) => item.includes("|"));
		const otherItems = cleanItems.filter((item) => !item.includes("|"));
		const noteStart = otherItems.findIndex((item) => /^(Os Held|O resultado|Ao fundir|Ã‰ necessÃ¡rio|E necessario)/i.test(item));
		const processBullets = noteStart >= 0 ? otherItems.slice(0, noteStart) : otherItems.slice(0, 4);
		const noteBullets = noteStart >= 0 ? otherItems.slice(noteStart) : otherItems.slice(processBullets.length);
		return compactHeldSteps([
			{
				index: 1,
				title: "VisÃ£o Geral",
				body: cleanParagraphs.slice(0, 2),
			},
			{
				index: 2,
				title: "Como realizar a fusÃ£o",
				bullets: processBullets,
			},
			{
				index: 3,
				title: "ObservaÃ§Ãµes importantes",
				bullets: noteBullets,
				rows: parseHeldPipeRows(costItems),
			},
		]);
	}

	return [];
}

function compactHeldSteps(steps = []) {
	return steps
		.map((step) => ({
			index: step.index,
			title: cleanStructuredText(step.title ?? ""),
			...(step.body?.length ? { body: step.body.map(cleanStructuredText).filter(Boolean) } : {}),
			...(step.bullets?.length ? { bullets: step.bullets.map(cleanStructuredText).filter(Boolean) } : {}),
			...(step.rows?.length ? { rows: step.rows } : {}),
		}))
		.filter((step) => step.title || step.body?.length || step.bullets?.length || step.rows?.length);
}

function parseHeldPipeRows(items = []) {
	return (items ?? [])
		.filter((item) => String(item ?? "").includes("|"))
		.map((item) => ({
			cells: String(item ?? "")
				.split(/\s*\|\s*/)
				.map((value) => buildHeldCell(value))
				.filter((cell) => cell.text || cell.raw),
		}))
		.filter((row) => row.cells.length >= 2);
}

function buildHeldCell(value) {
	const raw = cleanStructuredText(value);
	let text = raw;
	if (/\.(gif|png|jpg|jpeg|webp|svg)\b/i.test(raw)) {
		text = cleanStructuredText(stripImageRefFromText(raw))
			|| raw.replace(/\.(gif|png|jpg|jpeg|webp|svg)$/i, "").trim();
	}
	return raw && raw !== text
		? { text, raw }
		: { text };
}

function parseHeldBoostRangeRows(text) {
	const tokens = String(text ?? "")
		.replace(/^(?:level range|faixa de n[íi]vel)\s+boost\s+/i, "")
		.split(/\s+/)
		.filter(Boolean);
	const rows = [];
	for (let index = 0; index + 3 < tokens.length; index += 4) {
		rows.push({
			levelRange: `${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`,
			boost: tokens[index + 3],
		});
	}

	return rows;
}

function parseHeldStatEntries(text, maxValues) {
	const matches = [...String(text ?? "").matchAll(HELD_NAME_PATTERN)];
	if (!matches.length) return [];
	return matches.map((match, index) => {
		const start = match.index ?? 0;
		const end = index + 1 < matches.length ? (matches[index + 1].index ?? text.length) : text.length;
		return parseHeldStatEntry(String(text).slice(start, end), maxValues);
	}).filter(Boolean);
}

function parseHeldStatEntry(segment, maxValues) {
	const cleaned = String(segment ?? "").replace(/^icon\s+name\s+/i, "").trim();
	const nameMatch = cleaned.match(/^([XY]-[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*)?)\s+/);
	if (!nameMatch) return null;
	const name = cleanStructuredText(nameMatch[1]);
	const tokens = cleaned
		.slice(nameMatch[0].length)
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	const values = [];
	let index = 0;
	while (index < tokens.length && values.length < maxValues) {
		if (HELD_DESCRIPTION_START.test(tokens[index])) break;
		if (tokens[index + 1] === "->" && tokens[index + 2]) {
			values.push(`${tokens[index]} -> ${tokens[index + 2]}`);
			index += 3;
			continue;
		}
		values.push(tokens[index]);
		index += 1;
	}

	const description = cleanStructuredText(tokens.slice(index).join(" "));
	return {
		name,
		tiers: values.map((value, tierIndex) => ({
			tier: tierIndex + 1,
			value,
		})),
		...(description ? { description } : {}),
	};
}
