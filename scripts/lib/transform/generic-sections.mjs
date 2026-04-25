import { cleanStructuredText, stripImageRefFromText } from "./text.mjs";

export function parseTableCell(value) {
	const raw = cleanStructuredText(value);
	const withoutImageRefs = raw
		.replace(/\b\S+\.(?:gif|png|jpg|jpeg|webp|svg)\b/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
	const stripped = cleanStructuredText(stripImageRefFromText(raw));
	const text = (/\.(gif|png|jpg|jpeg|webp|svg)\b/i.test(stripped) ? "" : stripped)
		|| cleanStructuredText(withoutImageRefs)
		|| raw.replace(/\.(gif|png|jpg|jpeg|webp|svg)$/i, "").trim();
	return {
		text,
		...(raw !== text ? { raw } : {}),
	};
}

export function isAbilitySection(normalizedId, normalizedHeading) {
	return /^habilidades?(\s|$)/.test(normalizedId)
		|| /^habilidades?(\s|$)/.test(normalizedHeading);
}

export function isLocationSection(normalizedId, normalizedHeading) {
	return ["localizacao", "localizacoes", "location", "locations"].includes(normalizedId)
		|| ["localizacao", "localizacoes", "location", "locations"].includes(normalizedHeading);
}

export function isStepSection(normalizedId, normalizedHeading) {
	if (isAbilitySection(normalizedId, normalizedHeading) || isLocationSection(normalizedId, normalizedHeading)) return false;
	const value = `${normalizedId} ${normalizedHeading}`;
	return /\b(passo|passos|etapa|etapas|funcionamento|como|acesso|walkthrough|detonado|procedimento|mecanica|mecanicas)\b/.test(value);
}

export function parseHeadingGroupedEntries(paragraphs = [], bodyKey = "body") {
	const entries = [];
	let current = null;
	for (const value of paragraphs) {
		const text = cleanStructuredText(value);
		if (!text) continue;
		const title = text.match(/^#+\s+(.+)/);
		if (title) {
			if (current) entries.push(current);
			current = { name: cleanStructuredText(title[1]), [bodyKey]: [] };
			continue;
		}

		if (!current) current = { name: "", [bodyKey]: [] };
		current[bodyKey].push(text);
	}

	if (current) entries.push(current);
	return entries.filter((entry) => entry.name || entry[bodyKey]?.length);
}

export function parseStepEntries(paragraphs = [], items = [], fallbackTitle = "") {
	const normalizedFallbackTitle = cleanStructuredText(fallbackTitle);
	const numberedFallbackTitle = /^(?:\d+[ÂºÂªÂ°]?|[ivxlcdm]+)\b/i.test(normalizedFallbackTitle);
	const grouped = parseHeadingGroupedEntries(paragraphs, "body").map((entry, index) => ({
		index: index + 1,
		title: entry.name || (numberedFallbackTitle && index === 0 ? normalizedFallbackTitle : `${fallbackTitle || "Etapa"} ${index + 1}`),
		body: entry.body ?? [],
	}));

	if (grouped.length) return grouped;

	const rows = [...paragraphs, ...items]
		.filter((value) => !String(value ?? "").includes("|"))
		.map(cleanStructuredText)
		.filter(Boolean);
	if (!rows.length) return [];
	return rows.map((text, index) => {
		const numbered = text.match(/^(?:passo|etapa)?\s*(\d+)[ÂºÂªÂ°.)-]?\s*(.+)$/i);
		return {
			index: Number(numbered?.[1] ?? index + 1),
			title: numbered
				? cleanStructuredText(numbered[2])
				: (numberedFallbackTitle && index === 0 ? cleanStructuredText(fallbackTitle) : `${fallbackTitle || "Etapa"} ${index + 1}`),
			body: numbered ? [] : [text],
		};
	});
}

export function parseLocationEntries(paragraphs = [], items = []) {
	const descriptions = paragraphs.map(cleanStructuredText).filter(Boolean);
	const tableRows = items
		.filter((item) => String(item ?? "").includes("|"))
		.map((item) => String(item ?? "")
			.split(/\s*\|\s*/)
			.map(parseTableCell)
			.filter((cell) => cell.text || cell.raw))
		.filter((cells) => cells.length);
	const bullets = items
		.filter((item) => !String(item ?? "").includes("|"))
		.map(cleanStructuredText)
		.filter(Boolean);

	if (!descriptions.length && !tableRows.length && !bullets.length) return [];

	return [{
		description: descriptions,
		bullets,
		rows: tableRows.map((cells) => ({ cells })),
	}];
}
