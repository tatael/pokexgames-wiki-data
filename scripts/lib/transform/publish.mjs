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
			paragraphs = section.kind === "tasks"
				? []
				: filterTableMirrorLines(section, filterLinkedCardMarkerLines(section, section.paragraphs?.[locale] ?? []));
			if (section.kind === "pokemon-group" && section.pokemon) {
				paragraphs = paragraphs.filter((paragraph) => !isRawPokemonGroupMirrorParagraph(paragraph));
			}
		}

		const bullets = section.kind === "pokemon-group" && !section.bossRecommendations && !section.pokemon
			? (section.items?.[locale] ?? [])
			: (shouldPublishListContent(section)
				? filterLinkedCardMarkerLines(section, section.items?.[locale] ?? [])
					.filter((item) => !String(item ?? "").includes("|"))
					.filter((item) => !isMediaOnlyMirrorLine(item))
				: []);
		const value = {};
		if (paragraphs.length) value.paragraphs = paragraphs;
		if (bullets.length) value.bullets = bullets;
		if (Object.keys(value).length) content[locale] = value;
	}

	return content;
}

function filterTableMirrorLines(section, values = []) {
	const hasStructuredRows = section.tables || section.commerceEntries || section.dungeonSupport || section.bossSupport || section.locations;
	if (!hasStructuredRows) return values;
	return (values ?? []).filter((value) => !isRawTableMirrorLine(value) && !isMediaOnlyMirrorLine(value));
}

function isRawTableMirrorLine(value = "") {
	const source = String(value ?? "");
	const token = source
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9.]+/g, " ")
		.trim();
	if (/^(?:item|icone|icon)\s+(?:custo|cost|descricao|description)\b/.test(token)) return true;
	if (/^(?:pokemon|pok)/.test(token) && /\b(?:elemento|element|level|boost)\b/.test(token)) return true;
	if (!/\.(?:png|gif|webp|jpe?g|svg)\b/i.test(source)) return false;
	if (/^(?:pokemon|pokémon)\s+/.test(token) && /\.(?:png|gif|webp|jpe?g|svg)\b/i.test(source)) return true;
	const mediaCount = (source.match(/\.(?:png|gif|webp|jpe?g|svg)\b/gi) ?? []).length;
	return mediaCount >= 3 && /\b(?:item|custo|cost|icone|descricao|pontuacao|pokemon)\b/.test(token);
}

function isMediaOnlyMirrorLine(value = "") {
	const source = String(value ?? "").trim();
	if (!source || !/\.(?:png|gif|webp|jpe?g|svg)\b/i.test(source)) return false;
	const withoutFiles = source
		.replace(/[\p{L}\p{N}_%()' .,&-]+?\.(?:png|gif|webp|jpe?g|svg)\b/giu, " ")
		.replace(/[|,;:()[\]\-–—]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return !withoutFiles;
}

function isRawPokemonGroupMirrorParagraph(value = "") {
	const token = String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9.]+/g, " ")
		.trim();
	return /\bpokemon elemento\b/.test(token) && /\.(?:png|gif|webp|jpe?g|svg)\b/i.test(String(value ?? ""));
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
	const firstToken = normalizeCellForCompare(first.text ?? first.raw);
	const secondToken = normalizeCellForCompare(second.text ?? second.raw);
	if (cells.length >= 3 && second.text && (
		(firstToken && secondToken && (secondToken.includes(firstToken) || firstToken.includes(secondToken)))
		|| /^icone (?:do|da|de)\b/.test(firstToken)
	)) {
		return [second, ...rest.map(cleanCostCell)];
	}

	// Icon cell followed by name cell: merge into one entry with icon as raw, name as text
	if (first.raw && /\.(gif|png|jpg|jpeg|webp|svg)$/i.test(first.raw) && second.text) {
		return [{ text: second.text, raw: first.raw }, ...rest.map(cleanCostCell)];
	}

	// Duplicate identical cells: keep only the first
	if (rest.length && first.text && first.text === second.text && !first.raw && !second.raw) {
		return [first, ...rest.map(cleanCostCell)];
	}

	return cells.map(cleanCostCell);
}

function normalizeCellForCompare(value = "") {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/\.(?:png|gif|webp|jpe?g|svg)\b/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function cleanCostCell(cell) {
	const text = String(cell?.text ?? "").trim();
	const raw = String(cell?.raw ?? "").trim();
	const cleanedText = text
		.replace(/^(?:token|tokens?)\s+(?=\d+\b)/i, "")
		.replace(/^(?:anniversary token|lovely token)\s+(?=\d+\b)/i, "")
		.replace(/\b(\d+)\s+(\w+(?:\s+\w+){0,3})\s+\1\s+\2\b/i, "$1 $2")
		.trim();
	if (!cleanedText || cleanedText === text) return cell;
	return {
		...cell,
		text: cleanedText,
		...(raw && raw !== cleanedText ? { raw } : {}),
	};
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
