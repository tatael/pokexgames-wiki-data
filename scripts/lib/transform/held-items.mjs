import { cleanStructuredText, normalizeIdToken } from "./text.mjs";

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

		if (/^level range boost\b/i.test(normalizeIdToken(text))) {
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

function parseHeldBoostRangeRows(text) {
	const tokens = String(text ?? "")
		.replace(/^level range boost\s+/i, "")
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
