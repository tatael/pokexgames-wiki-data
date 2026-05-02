import { compactLocalizedValueMap } from "../localized.mjs";
import { parseTableCell } from "./generic-sections.mjs";

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
	for (const key of ["facts", "tasks", "taskGroups", "pokemon", "rewards", "profile", "moves", "effectiveness", "variants", "abilities", "steps", "locations", "difficulties", "bossSupport", "bossRecommendations", "heldEnhancement", "hazards", "dungeonSupport", "heldCategories", "heldBoosts", "heldDetails", "questSupport", "questPhases", "clanTasks", "embeddedTowerProgression", "embeddedTowerUnlocks", "embeddedTowerSupport", "linkedCards", "commerceEntries", "craftEntries"]) {
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
			paragraphs = section.kind === "tasks" ? [] : filterLinkedCardMarkerLines(section, section.paragraphs?.[locale] ?? []);
		}

		const bullets = section.kind === "pokemon-group" && !section.bossRecommendations && !section.pokemon
			? (section.items?.[locale] ?? [])
			: (shouldPublishListContent(section)
				? filterLinkedCardMarkerLines(section, section.items?.[locale] ?? []).filter((item) => !String(item ?? "").includes("|"))
				: []);
		const value = {};
		if (paragraphs.length) value.paragraphs = paragraphs;
		if (bullets.length) value.bullets = bullets;
		if (Object.keys(value).length) content[locale] = value;
	}

	return content;
}

function isLinkedCardMarkerLine(value = "") {
	const token = String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
	return /\b(?:veja mais|veja tambem|ver mais|saiba mais|para saber mais|acesse a pagina)\b/.test(token);
}

function filterLinkedCardMarkerLines(section, values = []) {
	if (!section.linkedCards || !section.wikiLinks) return values;
	return (values ?? []).filter((value) => !isLinkedCardMarkerLine(value));
}

function shouldPublishParagraphContent(section) {
	if (section.kind === "rewards") return false;
	if (section.abilities || section.steps || section.locations) return false;
	if (section.difficulties || section.bossSupport || section.bossRecommendations || section.heldEnhancement || section.hazards) return false;
	if (section.dungeonSupport || section.commerceEntries) return false;
	if (section.heldCategories || section.heldBoosts || section.heldDetails) return false;
	if (section.questSupport) return false;
	if (section.questPhases) return false;
	if (section.clanTasks) return false;
	if (section.embeddedTowerProgression || section.embeddedTowerUnlocks || section.embeddedTowerSupport) return false;
	if (section.linkedCards && !section.wikiLinks) return false;
	return true;
}

function shouldPublishListContent(section) {
	if (["tasks", "rewards"].includes(section.kind)) return false;
	if (section.kind === "tier" || section.kind === "pokemon-group") return false;
	if (section.steps || section.locations) return false;
	if (section.bossSupport || section.bossRecommendations || section.hazards || section.heldCategories || section.heldBoosts || section.heldDetails) return false;
	if (section.dungeonSupport || section.commerceEntries) return false;
	if (section.questSupport) return false;
	if (section.questPhases) return false;
	if (section.clanTasks) return false;
	if (section.embeddedTowerProgression || section.embeddedTowerUnlocks || section.embeddedTowerSupport) return false;
	if (section.linkedCards && !section.wikiLinks) return false;
	return true;
}

function mergeIconNameCells(cells) {
	if (cells.length < 2) return cells;
	const [first, second, ...rest] = cells;
	// Icon cell followed by name cell: merge into one entry with icon as raw, name as text
	if (first.raw && /\.(gif|png|jpg|jpeg|webp|svg)$/i.test(first.raw) && second.text) {
		return [{ text: second.text, raw: first.raw }, ...rest];
	}

	// Duplicate identical cells: keep only the first
	if (rest.length && first.text && first.text === second.text && !first.raw && !second.raw) {
		return [first, ...rest];
	}

	return cells;
}

function buildPublicSectionTables(section) {
	if (!shouldPublishListContent(section)) return {};
	const tables = {};
	for (const locale of Object.keys(section.items ?? {})) {
		const rows = [];
		for (const item of section.items?.[locale] ?? []) {
			if (!String(item ?? "").includes("|")) continue;
			const rawCells = String(item ?? "")
				.split(/\s*\|\s*/)
				.map(parseTableCell)
				.filter((cell) => cell.text || cell.raw);
			const cells = mergeIconNameCells(rawCells);
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
