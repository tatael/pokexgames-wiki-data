import { compactLocalizedValueMap } from "../localized.mjs";
import { parseTableCell } from "./generic-sections.mjs";

// "Tabber requires Javascript to function" / "Tabber requer Javascript para funcionar" is a
// MediaWiki placeholder the scraper sees when tabber content needs JS. It is never real content.
const TABBER_NOISE_RE = /^\s*tabber\s+requ(?:er| er|ire|ires)\b[^\n]*$/i;
// Internal sentinel inserted by extract.mjs for the PokéPark score tool. Should never reach
// visible content; it belongs only inside the pokepark-score commerceEntries payload.
const POKEPARK_SCORE_SENTINEL_RE = /__POKEPARK_SCORE__/;
// A bare sprite reference like "396-Starly" with no surrounding prose is an extraction artifact
// from the wiki's sprite list; render-side has nothing useful to do with it.
const SPRITE_REF_LINE_RE = /^\s*\d{1,4}\s*-\s*[A-Za-zÀ-ÿ][\w'-]*(?:\s+[A-Za-zÀ-ÿ][\w'-]*){0,3}\s*$/;

function isNoiseParagraph(value) {
	const text = String(value ?? "").trim();
	if (!text) return true;
	if (TABBER_NOISE_RE.test(text)) return true;
	if (POKEPARK_SCORE_SENTINEL_RE.test(text)) return true;
	if (SPRITE_REF_LINE_RE.test(text)) return true;
	return false;
}

// Filename tokens in visible prose are extraction junk when no matching media exists.
// When the section has a matching media entry, leave the token in place so the overlay's
// inline-media renderer turns it into an icon; otherwise strip it.
const PROSE_FILENAME_RE = /[\p{L}\p{N}()'._,&\- ]+?\.(?:png|gif|webp|jpe?g|svg)\b/giu;

function normalizeFilenameStem(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/\.(?:png|gif|webp|jpe?g|svg)\b/gi, "")
		.replace(/^\d{1,4}[-_. ]+/, "")
		.replace(/[_\-]+/g, " ")
		.replace(/[^A-Za-z0-9]+/g, " ")
		.trim()
		.toLowerCase();
}

function buildSectionMediaStems(section, locale) {
	const stems = new Set();
	const items = section?.media?.[locale] ?? section?.media?.["pt-BR"] ?? [];
	for (const item of items) {
		if (item?.alt) {
			const stem = normalizeFilenameStem(item.alt);
			if (stem) stems.add(stem);
		}
		if (item?.url) {
			try {
				const file = decodeURIComponent(String(item.url).split("/").pop() ?? "");
				const stem = normalizeFilenameStem(file);
				if (stem) stems.add(stem);
			} catch {}
		}
	}
	return stems;
}

function stripUnmatchedFilenames(text, mediaStems) {
	const source = String(text ?? "");
	if (!source) return "";
	if (!/\.(?:png|gif|webp|jpe?g|svg)\b/i.test(source)) return source;
	const cleaned = source.replace(PROSE_FILENAME_RE, (match) => {
		// Trim leading whitespace artifacts the multi-word regex may pull in.
		const stem = normalizeFilenameStem(match.replace(/^[^A-Za-zÀ-ÿ0-9]+/, ""));
		if (stem && mediaStems.has(stem)) return match;
		return " ";
	});
	return cleaned.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

function stripContentFilenames(values, mediaStems) {
	if (!mediaStems?.size && !Array.isArray(values)) return values;
	const out = [];
	for (const value of values ?? []) {
		const cleaned = stripUnmatchedFilenames(value, mediaStems ?? new Set());
		if (cleaned) out.push(cleaned);
	}
	return out;
}

// A source table that the extractor could not turn into real rows arrives as a run of
// pipe-delimited paragraphs, optionally split into "# Group" blocks. Left in prose it
// renders as a literal pipe wall, so it is promoted into real table groups here and the
// promoted lines are removed from the published paragraphs.
const GROUP_HEADING_RE = /^#+\s+(.+)$/;
const MIN_PROMOTED_ROWS = 2;

function splitPipeRow(value) {
	return String(value ?? "")
		.split(/\s*\|\s*/)
		.map(parseTableCell)
		.filter((cell) => cell.text || cell.raw);
}

function isPipeRowLine(value) {
	const text = String(value ?? "");
	if (!text.includes("|")) return false;
	// Count raw segments, not parsed cells: a cell holding only an icon filename
	// parses to an empty cell, and using the parsed count would misread
	// "Item.png | Custo" as ordinary prose.
	return text.split("|").map((part) => part.trim()).filter(Boolean).length >= 2;
}

export function extractParagraphTableGroups(paragraphs = []) {
	const blocks = [];
	let current = { title: "", rows: [], prose: [] };
	const push = () => {
		if (current.title || current.rows.length || current.prose.length) blocks.push(current);
		current = { title: "", rows: [], prose: [] };
	};

	for (const value of paragraphs ?? []) {
		const text = String(value ?? "").trim();
		if (!text) continue;
		const headingMatch = text.match(GROUP_HEADING_RE);
		if (headingMatch) {
			push();
			current.title = headingMatch[1].trim();
			continue;
		}

		if (isPipeRowLine(text)) current.rows.push(text);
		else current.prose.push(text);
	}

	push();

	const promotedRowCount = blocks.reduce((total, block) => total + block.rows.length, 0);
	if (promotedRowCount < MIN_PROMOTED_ROWS) {
		return { groups: [], listItems: [], remaining: (paragraphs ?? []).map((value) => String(value ?? "").trim()).filter(Boolean) };
	}

	const groups = [];
	const remaining = [];
	const listItems = [];
	// Anything not turned into a table or list is handed back verbatim; this function
	// must never silently drop a source line.
	const keepAsProse = (block) => {
		if (block.title) remaining.push(`# ${block.title}`);
		remaining.push(...block.rows, ...block.prose);
	};

	for (const block of blocks) {
		if (block.rows.length < MIN_PROMOTED_ROWS) {
			keepAsProse(block);
			continue;
		}

		const parsed = block.rows.map((line) => ({ cells: mergeIconNameCells(splitPipeRow(line)) }));

		const cellText = (cell) => {
			const label = String(cell?.text ?? "").trim();
			const file = String(cell?.raw ?? "").trim();
			return file && label && file !== label ? `${file} ${label}` : (label || file);
		};

		// An "<icon> | <name>" pair merges down to a single cell, so a run of those is a
		// list of items, not a table. Publishing them as bullets keeps the icon+label and
		// avoids both a degenerate one-column table and a literal pipe wall in prose.
		//
		// Only a single leading header row is recognised. Splitting the block at every
		// multi-cell row was tried and measured worse: a 3-column roster row
		// ("<icon> | <name> | <weaknesses>") gets misread as a header, and joining its
		// cells leaks raw filenames into visible text.
		const headerRow = parsed[0]?.cells.length >= 2 ? parsed[0] : null;
		const itemRows = headerRow ? parsed.slice(1) : parsed;
		if (itemRows.length >= MIN_PROMOTED_ROWS && itemRows.every((row) => row.cells.length === 1)) {
			if (block.title) remaining.push(`# ${block.title}`);
			if (headerRow) {
				const heading = headerRow.cells.map(cellText).filter(Boolean).join(" — ");
				if (heading) remaining.push(`# ${heading}`);
			}

			remaining.push(...block.prose);
			for (const row of itemRows) {
				const value = cellText(row.cells[0]);
				if (value) listItems.push(value);
			}

			continue;
		}

		// The bundle schema requires every published row to have at least two cells, so a
		// block that cannot publish all of its rows stays prose rather than shipping a
		// half-complete table.
		const rows = parsed.filter((row) => row.cells.length >= 2);
		if (rows.length < MIN_PROMOTED_ROWS || rows.length !== parsed.length) {
			keepAsProse(block);
			continue;
		}

		remaining.push(...block.prose);
		const group = { type: "table", rows };
		if (block.title) group.title = block.title;
		groups.push(group);
	}

	return { groups, remaining, listItems };
}

export function publishSection(section) {
	const output = {
		id: section.id ?? "",
		kind: section.kind ?? "prose",
		title: compactLocalizedValueMap(section.heading ?? {}),
	};
	const promoted = buildPromotedParagraphTables(section);
	const content = compactLocalizedValueMap(buildPublicSectionContent(section, promoted));
	const tables = compactLocalizedValueMap(buildPublicSectionTables(section, promoted));
	if (Object.keys(content).length) output.content = content;
	if (Object.keys(tables).length) output.tables = tables;
	if (section.media) output.media = compactLocalizedValueMap(section.media);
	for (const key of ["facts", "tasks", "taskGroups", "pokemon", "rewards", "profile", "moves", "effectiveness", "variants", "abilities", "steps", "locations", "difficulties", "bossSupport", "bossRecommendations", "heldEnhancement", "hazards", "dungeonSupport", "heldCategories", "heldBoosts", "heldDetails", "questSupport", "questPhases", "combatPokemon", "clanTasks", "embeddedTowerProgression", "embeddedTowerUnlocks", "embeddedTowerSupport", "linkedCards", "commerceEntries", "craftEntries", "travelNetwork", "boostLookup", "talentTrees", "pokelogEntries", "adventurerMaps"]) {
		if (section[key]) output[key] = compactLocalizedValueMap(section[key]);
	}

	return output;
}

// Runs the paragraph-table promotion once per locale so content and tables agree on
// which lines were consumed.
function buildPromotedParagraphTables(section) {
	const promoted = {};
	if (!shouldPublishParagraphContent(section) || section.kind === "tasks") return promoted;
	for (const locale of Object.keys(section.paragraphs ?? {})) {
		const source = filterTableMirrorLines(
			section,
			filterLinkedCardMarkerLines(section, section.paragraphs?.[locale] ?? []),
		).filter((paragraph) => !isNoiseParagraph(paragraph));
		const result = extractParagraphTableGroups(source);
	  if (result.groups.length || result.listItems.length) promoted[locale] = result;
	}

	return promoted;
}

function buildPublicSectionContent(section, promoted = {}) {
	const content = {};
	const locales = new Set([
		...Object.keys(section.paragraphs ?? {}),
		...Object.keys(section.items ?? {}),
	]);
	for (const locale of locales) {
		const mediaStems = buildSectionMediaStems(section, locale);

		let paragraphs = [];
		if (shouldPublishParagraphContent(section)) {
			paragraphs = section.kind === "tasks"
				? []
				: (promoted[locale]?.remaining
					?? filterTableMirrorLines(section, filterLinkedCardMarkerLines(section, section.paragraphs?.[locale] ?? [])));
			if (section.kind === "pokemon-group" && section.pokemon) {
				paragraphs = paragraphs.filter((paragraph) => !isRawPokemonGroupMirrorParagraph(paragraph));
			}
			paragraphs = paragraphs.filter((paragraph) => !isNoiseParagraph(paragraph));
			paragraphs = stripContentFilenames(paragraphs, mediaStems);
		}

		const promotedBullets = promoted[locale]?.listItems ?? [];
		const bullets = stripContentFilenames(
			[...promotedBullets, ...(section.kind === "pokemon-group" && !section.bossRecommendations && !section.pokemon
				? (section.items?.[locale] ?? [])
				: (shouldPublishListContent(section)
					? filterLinkedCardMarkerLines(section, section.items?.[locale] ?? [])
						.filter((item) => !String(item ?? "").includes("|"))
						.filter((item) => !isMediaOnlyMirrorLine(item))
					: []))].filter((item) => !isNoiseParagraph(item)),
			mediaStems,
		);
		const value = {};
		if (paragraphs.length) value.paragraphs = paragraphs;
		if (bullets.length) value.bullets = bullets;
		if (Object.keys(value).length) content[locale] = value;
	}

	return content;
}

function filterTableMirrorLines(section, values = []) {
	const cellHaystack = buildStructuredCellHaystack(section);
	// Pipe rows in `items` become a table at publish time, so they count as structured
	// rows even though `section.tables` does not exist yet.
	const hasStructuredRows = section.tables || section.commerceEntries || section.dungeonSupport
		|| section.bossSupport || section.locations || Boolean(cellHaystack);
	if (!hasStructuredRows) return values;
	return (values ?? []).filter((value) => !isRawTableMirrorLine(value)
		&& !isMediaOnlyMirrorLine(value)
		&& !isStructuredCellEcho(value, cellHaystack));
}

// Every cell of the section's structured rows, normalized, as one searchable string.
// This runs before `buildPublicSectionTables`, so the generic table rows are read from
// `section.items` (the pipe rows they are built from) rather than from `section.tables`.
function buildStructuredCellHaystack(section) {
	const parts = [];
	const collectRows = (rows) => {
		for (const row of rows ?? []) {
			for (const cell of row?.cells ?? []) parts.push(String(cell?.raw ?? cell?.text ?? ""));
		}
	};

	for (const items of Object.values(section.items ?? {})) {
		for (const item of items ?? []) {
			if (String(item ?? "").includes("|")) parts.push(String(item));
		}
	}

	for (const groups of Object.values(section.tables ?? {})) {
		for (const group of groups ?? []) collectRows(group?.rows);
	}

	for (const payload of Object.values(section.commerceEntries ?? {})) collectRows(payload?.rows);

	return normalizeEchoText(parts.join("  "));
}

function normalizeEchoText(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

// A craft table's ingredient cell stacks many "<qty> <item>" pairs, and the extractor
// also emits each pair as its own paragraph — the same data printed as a text wall above
// and below the rendered table. A paragraph that appears verbatim inside a published
// cell is that echo, not prose. Sentence-like lines are never dropped, so real
// explanations that merely quote an item name survive.
function isStructuredCellEcho(value, cellHaystack) {
	if (!cellHaystack) return false;
	const text = String(value ?? "").trim();
	if (!text || text.length < 4) return false;
	if (/[.!?:;]$/.test(text)) return false;
	if (text.split(/\s+/).length > 8) return false;
	return cellHaystack.includes(normalizeEchoText(text));
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

function rewardSectionHasParsedRewards(section) {
	return Object.values(section.rewards ?? {}).some((list) => (list ?? []).length);
}

function shouldPublishParagraphContent(section) {
	// A reward section that parsed no structured rewards (the reward is stated only in prose)
	// still needs its paragraphs, otherwise it renders as an empty card.
	if (section.kind === "rewards") return !rewardSectionHasParsedRewards(section);
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
	if (section.kind === "rewards") return !rewardSectionHasParsedRewards(section);
	if (section.kind === "tasks") return false;
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

function buildPublicSectionTables(section, promoted = {}) {
	const tables = {};
	const locales = new Set([
		...Object.keys(section.items ?? {}),
		...Object.keys(promoted),
	]);
	for (const locale of locales) {
		const groups = [];

		if (shouldPublishListContent(section)) {
			const rows = [];
			for (const item of section.items?.[locale] ?? []) {
				if (!String(item ?? "").includes("|")) continue;
				const cells = mergeIconNameCells(splitPipeRow(item));
				if (cells.length >= 2) rows.push({ cells });
			}

			if (rows.length) groups.push({ type: "table", rows });
		}

		groups.push(...(promoted[locale]?.groups ?? []));
		if (groups.length) tables[locale] = groups;
	}

	return tables;
}
