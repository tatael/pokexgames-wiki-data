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
	const headingGroups = parseHeadingGroupedEntries(paragraphs, "body");
	const grouped = headingGroups.map((entry, index) => ({
		index: index + 1,
		title: entry.name || (numberedFallbackTitle && index === 0 ? normalizedFallbackTitle : headingGroups.length === 1 ? normalizedFallbackTitle : `${fallbackTitle || "Etapa"} ${index + 1}`),
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
				: (numberedFallbackTitle && index === 0 ? cleanStructuredText(fallbackTitle) : rows.length === 1 ? normalizedFallbackTitle : `${fallbackTitle || "Etapa"} ${index + 1}`),
			body: numbered ? [] : [text],
		};
	});
}

// A paragraph that is nothing but image filenames — "Minimap - Locais de Caça (Luxray) 3.webp
// Minimap - Locais de Caça (Luxray) 4.webp" — is the caption row of a picture strip. The
// pictures are already published as mediaRefs, so the filenames would render as a line of
// junk text directly above the images they name.
function isMediaFilenameLine(value) {
	const text = String(value ?? "").trim();
	if (!text) return true;
	if (!/\.(?:png|gif|webp|jpe?g|svg)\b/i.test(text)) return false;
	// File names carry spaces on this wiki ("Minimap - Locais de Caça (Luxray) 3.webp"), so a
	// run is everything up to an extension. If consuming those runs leaves nothing, the line
	// was only file names.
	const withoutFiles = text.replace(/[^.]*\.(?:png|gif|webp|jpe?g|svg)\b/gi, " ").replace(/\s+/g, " ").trim();
	return withoutFiles.length === 0;
}

export function parseLocationEntries(paragraphs = [], items = []) {
	const allDescriptions = paragraphs.map(cleanStructuredText).filter(Boolean);
	const withoutCaptions = allDescriptions.filter((value) => !isMediaFilenameLine(value));
	// Only drop the caption lines when something real is left. On a page whose location
	// section is nothing but a picture strip, dropping them empties the payload and the
	// section publishes as generic-only, which bundle validation rejects.
	const descriptions = withoutCaptions.length ? withoutCaptions : allDescriptions;
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
