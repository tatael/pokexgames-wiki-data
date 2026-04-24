import { compactLocalizedValueMap } from "../localized.mjs";
import { cleanStructuredText, normalizeIdToken, stripImageRefFromText } from "./text.mjs";

export function publishSection(section) {
	const output = {
		id: section.id ?? "",
		kind: section.kind ?? "prose",
		title: compactLocalizedValueMap(section.heading ?? {}),
	};
	const content = compactLocalizedValueMap(buildPublicSectionContent(section));
	const tables = compactLocalizedValueMap(buildPublicSectionTables(section));
	if (Object.keys(content).length) output.content = content;
	if (Object.keys(tables).length) output.tables = tables;
	if (section.media) output.media = compactLocalizedValueMap(section.media);
	for (const key of ["facts", "tasks", "taskGroups", "pokemon", "rewards", "profile", "moves", "effectiveness", "variants", "abilities", "steps", "locations", "difficulties", "heldEnhancement", "hazards", "heldCategories", "heldBoosts", "questSupport", "questPhases", "clanTasks", "embeddedTowerProgression", "embeddedTowerUnlocks", "linkedCards"]) {
		if (section[key]) output[key] = compactLocalizedValueMap(section[key]);
	}

	return output;
}

function buildPublicSectionContent(section) {
	const content = {};
	const locales = new Set([
		...Object.keys(section.paragraphs ?? {}),
		...Object.keys(section.items ?? {}),
	]);
	for (const locale of locales) {
		let paragraphs = [];
		if (shouldPublishParagraphContent(section)) {
			paragraphs = section.kind === "tasks"
				? (section.taskGroups?.[locale]?.intro ?? [])
				: (section.paragraphs?.[locale] ?? []);
		}

		const bullets = section.kind === "pokemon-group"
			? (section.items?.[locale] ?? [])
			: (shouldPublishListContent(section)
				? (section.items?.[locale] ?? []).filter((item) => !String(item ?? "").includes("|"))
				: []);
		const value = {};
		if (paragraphs.length) value.paragraphs = paragraphs;
		if (bullets.length) value.bullets = bullets;
		if (Object.keys(value).length) content[locale] = value;
	}

	return content;
}

function shouldPublishParagraphContent(section) {
	if (section.abilities || section.steps || section.locations) return false;
	if (section.difficulties || section.heldEnhancement || section.hazards) return false;
	if (section.heldCategories || section.heldBoosts) return false;
	if (section.questSupport) return false;
	if (section.questPhases) return false;
	if (section.clanTasks) return false;
	if (section.embeddedTowerProgression || section.embeddedTowerUnlocks || section.linkedCards) return false;
	return true;
}

function shouldPublishListContent(section) {
	if (["tasks", "rewards"].includes(section.kind)) return false;
	if (section.kind === "tier" || section.kind === "pokemon-group") return false;
	if (section.steps || section.locations) return false;
	if (section.hazards || section.heldCategories || section.heldBoosts) return false;
	if (section.questSupport) return false;
	if (section.questPhases) return false;
	if (section.clanTasks) return false;
	if (section.embeddedTowerProgression || section.embeddedTowerUnlocks || section.linkedCards) return false;
	return true;
}

function buildPublicSectionTables(section) {
	if (!shouldPublishListContent(section)) return {};
	const tables = {};
	for (const locale of Object.keys(section.items ?? {})) {
		const rows = [];
		for (const item of section.items?.[locale] ?? []) {
			if (!String(item ?? "").includes("|")) continue;
			const cells = String(item ?? "")
				.split(/\s*\|\s*/)
				.map(parseTableCell)
				.filter((cell) => cell.text || cell.raw);
			if (cells.length >= 2) rows.push({ cells });
		}

		if (rows.length) {
			tables[locale] = [{
				type: "table",
				rows,
			}];
		}
	}

	return tables;
}

function parseTableCell(value) {
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
	const numberedFallbackTitle = /^(?:\d+[ºª°]?|[ivxlcdm]+)\b/i.test(normalizedFallbackTitle);
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
		const numbered = text.match(/^(?:passo|etapa)?\s*(\d+)[ºª°.)-]?\s*(.+)$/i);
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
