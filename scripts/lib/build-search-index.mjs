// Search used to match the manifest's per-page `searchText`, which is a summary of what a
// page is *about*. That finds the five pages named after a Pokémon and misses the twelve
// that merely mention it — the NPC who sells it, the dungeon that drops it, the quest that
// rewards it. Those are the pages a player opens the overlay to find.
//
// This builds an inverted index over the full published body of every page, including
// typed payloads (rosters, reward names, task text), and ships it as its own artifact so
// the manifest stays small and the index loads only when someone actually searches.

import { PT_BR } from "./shared.mjs";

export const SEARCH_INDEX_VERSION = 1;

// A title hit means the page *is* the thing; a body hit means it mentions it. Ranking has
// to keep those apart or "Dratini" buries its own page under twelve trap tables.
const WEIGHT_TITLE = 8;
const WEIGHT_SUMMARY = 4;
const WEIGHT_SECTION_TITLE = 3;
const WEIGHT_BODY = 1;

const MIN_TOKEN_LENGTH = 2;
const MAX_TOKEN_LENGTH = 24;
// A token on more than a quarter of the pages ("pokemon", "nivel") carries no signal and
// costs the most space; the ranking would have to discard it anyway.
const MAX_DOCUMENT_FREQUENCY = 0.25;
// A ratio alone is meaningless on a small corpus: at ten pages it would drop any term on
// three of them, and on a single page it drops everything. A term has to be genuinely
// widespread before frequency says anything about how useful it is.
const MIN_COMMON_PAGES = 25;
const MAX_WALK_DEPTH = 8;

export function normalizeSearchText(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase();
}

// A hyphen joins as well as separates: "X-Lucky" has to be findable as `xlucky` (the item
// a player types) and as `lucky` (a word inside it). Emitting both is what stops "x-lucky"
// from degrading into a search for "lucky" anywhere in the bundle.
export function tokenizeSearchText(value) {
	const out = [];
	const keep = (token) => {
		if (token.length >= MIN_TOKEN_LENGTH && token.length <= MAX_TOKEN_LENGTH) out.push(token);
	};

	for (const chunk of normalizeSearchText(value).split(/[^a-z0-9-]+/)) {
		if (!chunk) continue;
		const parts = chunk.split("-").filter(Boolean);
		for (const part of parts) keep(part);
		if (parts.length > 1) keep(parts.join(""));
	}

	return out;
}

// Typed payloads hold the most valuable mentions (a Pokémon name inside a roster, an item
// inside a reward list), so the whole section is walked rather than just its prose.
function* walkStrings(value, depth = 0) {
	if (depth > MAX_WALK_DEPTH) return;
	if (typeof value === "string") {
		yield value;
		return;
	}

	if (Array.isArray(value)) {
		for (const entry of value) yield* walkStrings(entry, depth + 1);
		return;
	}

	if (value && typeof value === "object") {
		for (const entry of Object.values(value)) yield* walkStrings(entry, depth + 1);
	}
}

function localized(map, locale) {
	return map?.[locale] ?? map?.[PT_BR] ?? "";
}

/**
 * @param {Array<{ slug: string, page: object }>} entries
 * @returns {{ version: number, slugs: string[], tokens: Record<string, string> }}
 */
export function buildSearchIndex(entries, locale = PT_BR) {
	const slugs = [];
	const postings = new Map();

	for (const { slug, page } of entries) {
		if (!slug || !page) continue;
		const index = slugs.push(slug) - 1;

		// One weight per token per page — its strongest field wins, so a word in the title
		// is not diluted by also appearing in a table.
		const weights = new Map();
		const add = (text, weight) => {
			for (const token of tokenizeSearchText(text)) {
				weights.set(token, Math.max(weights.get(token) ?? 0, weight));
			}
		};

		add(localized(page.title, locale), WEIGHT_TITLE);
		add(localized(page.summary, locale), WEIGHT_SUMMARY);
		add(localized(page.pageGroup, locale), WEIGHT_SUMMARY);
		for (const section of page.sections ?? []) {
			add(localized(section.title, locale), WEIGHT_SECTION_TITLE);
			for (const text of walkStrings(section)) add(text, WEIGHT_BODY);
		}

		for (const [token, weight] of weights) {
			if (!postings.has(token)) postings.set(token, []);
			postings.get(token).push([index, weight]);
		}
	}

	const limit = Math.max(MIN_COMMON_PAGES, slugs.length * MAX_DOCUMENT_FREQUENCY);
	const tokens = {};
	// Terms dropped for being everywhere are published too. Without that list the client
	// cannot tell "this word is too common to index" from "this word is not in the bundle",
	// and a natural-language query like "onde pegar dratini" returns nothing.
	const common = [];
	for (const [token, entryList] of postings) {
		if (entryList.length > limit) {
			common.push(token);
			continue;
		}
		// `12` for a body hit, `12:8` when the page's title carries the term. Packing the
		// postings as a string keeps the artifact roughly a third of the nested-array size.
		tokens[token] = entryList
			.map(([index, weight]) => (weight === WEIGHT_BODY ? String(index) : `${index}:${weight}`))
			.join(",");
	}

	return { version: SEARCH_INDEX_VERSION, slugs, tokens, common: common.sort() };
}
