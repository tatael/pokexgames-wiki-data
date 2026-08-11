// The wiki's interactive tool pages (travel router, Master Ball boost lookup, Star Signs
// tree, PokéLog planner) are single-page apps embedded in the article. `extractArticleHtml`
// strips their <script>, so the overlay only ever received the surrounding prose — a page
// that says "select an origin and click Calculate Route" with no controls on it.
//
// Their data is plain array/object literals, so each tool is published as a typed payload
// and the overlay rebuilds the tool natively. Only the data is taken; the wiki's rendering
// and layout are not reused.

import { extractJsLiteral } from "./extract-js-literal.mjs";

function asNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function cleanText(value) {
	return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Transport notes are authored as HTML ("comprar um <img …> Lapras Ticket com <a …>NPC
// Mia</a>"). The overlay escapes what it renders, so the raw tags would show up as text —
// keep the sentence, drop the markup, and let the link text stand in for the link.
function cleanNote(value) {
	return cleanText(
		String(value ?? "")
			.replace(/<[^>]*>/g, " ")
			.replace(/&nbsp;/gi, " ")
			.replace(/&amp;/gi, "&")
			.replace(/&lt;/gi, "<")
			.replace(/&gt;/gi, ">")
			.replace(/&quot;/gi, '"')
			.replace(/\s+([,.;:])/g, "$1")
	);
}

// --- Viagens: the transport graph -------------------------------------------------

export function extractTravelNetwork(html) {
	const cities = extractJsLiteral(html, "pointsCities");
	const stops = extractJsLiteral(html, "pointsTransports");
	const links = extractJsLiteral(html, "transports");
	if (!Array.isArray(cities) || !Array.isArray(stops) || !Array.isArray(links)) return null;

	const point = (entry, kind) => {
		const id = cleanText(entry?.id);
		const x = asNumber(entry?.x);
		const y = asNumber(entry?.y);
		if (!id || x === null || y === null) return null;
		const result = { id, x, y, region: cleanText(entry?.region), kind };
		if (entry?.isVip) result.isVip = true;
		if (entry?.img) result.image = String(entry.img);
		return result;
	};

	const points = [
		...cities.map((entry) => point(entry, "city")),
		...stops.map((entry) => point(entry, "stop")),
	].filter(Boolean);

	const edges = links
		.map((entry) => {
			const from = cleanText(entry?.from);
			const to = cleanText(entry?.to);
			if (!from || !to) return null;
			const edge = { from, to, bidirectional: entry?.bidirectional !== false };
			if (entry?.requiresVip) edge.requiresVip = true;
			const note = cleanNote(entry?.note);
			if (note) edge.note = note;
			return edge;
		})
		.filter(Boolean);

	if (!points.length || !edges.length) return null;
	// A link pointing at a stop the page never defined would silently make a route
	// unreachable, so drop those rather than publish a broken graph.
	const known = new Set(points.map((entry) => entry.id));
	const usable = edges.filter((edge) => known.has(edge.from) && known.has(edge.to));
	if (!usable.length) return null;

	return { points, links: usable };
}

// --- Boost da Master Ball: boost level -> Pokémon ---------------------------------

export function extractBoostLookup(html) {
	const data = extractJsLiteral(html, "pokemonByBoost");
	if (!data || Array.isArray(data) || typeof data !== "object") return null;

	const groups = Object.entries(data)
		.map(([boost, entries]) => ({
			boost: asNumber(boost),
			pokemon: (Array.isArray(entries) ? entries : [])
				.map((entry) => {
					const name = cleanText(entry?.name);
					if (!name) return null;
					const result = { name };
					const image = cleanText(entry?.image);
					if (image) result.image = image;
					return result;
				})
				.filter(Boolean),
		}))
		.filter((group) => group.boost !== null && group.pokemon.length)
		.sort((left, right) => right.boost - left.boost);

	return groups.length ? { groups } : null;
}

// --- Star Signs: the constellation trees ------------------------------------------

// The `forest` literal holds the tree layout, but its skill names are the widget's
// internal labels — partly accent-stripped ("Bastiao de Ferro", "Nucleo Azul-Celeste").
// The display strings live in a separate `skillTranslations` map keyed by skill `type`,
// one entry per language, so the correct text (and the other two languages) only exist
// there. Locale codes map to the wiki's own keys.
const TALENT_LOCALE_KEYS = new Map([
	["pt-BR", "BR"],
	["en", "ENG"],
	["es", "ESP"],
]);

export function extractTalentTrees(html, locale = "pt-BR") {
	const forest = extractJsLiteral(html, "forest");
	const trees = forest?.trees;
	if (!Array.isArray(trees) || !trees.length) return null;

	const translations = extractJsLiteral(html, "skillTranslations") ?? {};
	const localeKey = TALENT_LOCALE_KEYS.get(locale) ?? "BR";
	const translated = (skill, field) => {
		const entry = translations?.[skill?.type]?.[localeKey];
		return cleanText(entry?.[field]);
	};

	const parsed = trees
		.map((tree) => {
			const id = cleanText(tree?.id);
			const name = cleanText(tree?.name);
			if (!id || !name) return null;
			const skills = (tree?.skills ?? [])
				.map((skill) => {
					const skillId = cleanText(skill?.id);
					// Prefer the translated label; fall back to the internal one so a skill
					// the translation map has not caught up with still renders.
					const skillName = translated(skill, "name") || cleanText(skill?.name);
					if (!skillId || !skillName) return null;
					const result = {
						id: skillId,
						name: skillName,
						prereqs: (skill?.prereqs ?? []).map(cleanText).filter(Boolean),
					};
					const description = translated(skill, "desc") || cleanText(skill?.desc);
					if (description) result.description = description;
					const value = cleanText(skill?.value);
					if (value) result.value = value;
					const unit = cleanText(skill?.unit);
					if (unit) result.unit = unit;
					if (skill?.isStart) result.isStart = true;
					if (skill?.isSpecial || skill?.special) result.isSpecial = true;
					return result;
				})
				.filter(Boolean);
			return skills.length ? { id, name, skills } : null;
		})
		.filter(Boolean);

	if (!parsed.length) return null;
	return {
		maxPoints: asNumber(forest?.maxPoints) ?? 0,
		maxSpecialPoints: asNumber(forest?.maxSpecialPoints) ?? 0,
		pointsRequiredForSpecial: asNumber(forest?.pointsRequiredForSpecial) ?? 0,
		trees: parsed,
	};
}

// --- PokéLog planner: per-Pokémon research stages ---------------------------------

export function extractPokelogEntries(html) {
	const data = extractJsLiteral(html, "DATA");
	if (!Array.isArray(data) || !data.length) return null;

	const entries = data
		.map((entry) => {
			const name = cleanText(entry?.nome);
			if (!name) return null;
			const stages = (entry?.estagios ?? [])
				.map((stage) => ({
					amount: asNumber(stage?.qtd),
					research: asNumber(stage?.research),
					pokelog: asNumber(stage?.pokelog),
					experience: asNumber(stage?.exp),
				}))
				.filter((stage) => stage.amount !== null);
			if (!stages.length) return null;

			const result = { name, stages };
			const dex = cleanText(entry?.dex);
			if (dex) result.dex = dex;
			const image = cleanText(entry?.foto);
			if (image) result.image = image;
			const pokelogCategory = cleanText(entry?.categoriaPokelog);
			if (pokelogCategory) result.pokelogCategory = pokelogCategory;
			const experienceCategory = cleanText(entry?.categoriaExperience);
			if (experienceCategory) result.experienceCategory = experienceCategory;
			const elements = cleanText(entry?.elemento).split(/\s*,\s*/).filter(Boolean);
			if (elements.length) result.elements = elements;
			return result;
		})
		.filter(Boolean);

	return entries.length ? { entries } : null;
}

// --- Buscador de Mapas de Aventureiro ---------------------------------------------

// The overlay page for adventurer maps used to be four screenshots of the wiki's own web
// finder plus instructions for clicking it — useless from inside the overlay, and already
// stale (the screenshots show three map colours; the data has four). The finder's dataset
// is a `specificOptions` literal keyed by map type, then by the terrain the X sits on.
const ADVENTURER_MAP_TYPES = new Map([
	["1", "Mapa Vermelho"],
	["2", "Mapa Verde"],
	["3", "Mapa Roxo"],
	["4", "Mapa Azul"],
]);

export function extractAdventurerMaps(html) {
	const data = extractJsLiteral(html, "specificOptions");
	if (!data || typeof data !== "object" || Array.isArray(data)) return null;

	const maps = [];
	const tags = new Set();
	const terrains = new Set();

	for (const [typeKey, groups] of Object.entries(data)) {
		const typeLabel = ADVENTURER_MAP_TYPES.get(String(typeKey));
		if (!typeLabel || !groups || typeof groups !== "object") continue;

		for (const [terrain, entries] of Object.entries(groups)) {
			if (!Array.isArray(entries)) continue;
			for (const entry of entries) {
				const id = cleanText(entry?.id);
				const image = cleanText(entry?.imageUrl);
				if (!id || !image) continue;
				const entryTags = (entry?.tags ?? []).map(cleanText).filter(Boolean);
				const cleanTerrain = cleanText(terrain);
				maps.push({
					id,
					type: typeLabel,
					terrain: cleanTerrain,
					location: cleanText(entry?.local),
					coordinates: cleanText(entry?.coordinates),
					tags: entryTags,
					image,
				});
				if (cleanTerrain) terrains.add(cleanTerrain);
				for (const tag of entryTags) tags.add(tag);
			}
		}
	}

	if (!maps.length) return null;
	const byLabel = (left, right) => left.localeCompare(right, "pt-BR");
	return {
		types: [...ADVENTURER_MAP_TYPES.values()].filter((label) => maps.some((map) => map.type === label)),
		terrains: [...terrains].sort(byLabel),
		tags: [...tags].sort(byLabel),
		maps,
	};
}
