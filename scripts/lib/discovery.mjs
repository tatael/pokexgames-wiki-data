import { stat } from "node:fs/promises";

import {
	CONFIG_PATH,
	DISCOVERED_CONFIG_PATH,
	POKEMON_DISCOVERY_CACHE_PATH,
	PT_BR,
	WIKI_DISCOVERY_CACHE_HOURS,
	WIKI_DISCOVERY_CONCURRENCY,
	WIKI_DISCOVERY_FORCE,
	WIKI_SOURCE_ORIGIN,
	buildLocalizedText,
	buildPagePath,
	buildSlug,
	readJson,
	writeJson,
} from "./shared.mjs";
import { fetchWikiApiJson, fetchWikiHtml, runWithConcurrency } from "./transport.mjs";
import {
	extractArticleHtml,
	extractArticleWikiLinks,
	mergeNavigationPath,
} from "./extract.mjs";
import { cmsEntriesAsLinks } from "./extract-cms-list.mjs";

const POKEMON_CATEGORY_LABEL = {
	"pt-BR": "Pokémon",
	en: "Pokemon",
	es: "Pokémon",
};

const POKEMON_DISCOVERY_TOKEN_BLACKLIST = new Set([
	"addon", "addons", "adventure", "anniversary", "arcade", "arena", "bag", "backpack", "ball", "banner",
	"battle", "bed", "berry", "boost", "boss", "bottle", "box", "camera", "cam", "capsule", "carpet", "chair",
	"coin", "costume", "cup", "decoration", "detector", "disk", "dungeon", "egg", "elixir", "esp", "event",
	"en", "eng", "es", "pt", "br",
	"factory", "figure", "fireplace", "fossil", "gem", "guide", "holder", "item", "juice", "key", "lab", "locker",
	"map", "mission", "missions", "npc", "outfit", "page", "park", "planner", "potion", "present", "professor",
	"quest", "rewards", "route", "salad", "search", "signs", "sofa", "stone", "system", "systems", "table", "task",
	"tasks", "tea", "ticket", "token", "tower", "trainer", "transportes", "tv", "tutorial", "vip", "workshop",
]);

function validateLocalizedMap(value, fieldName) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${fieldName} must be an object`);
	}

	for (const locale of [PT_BR, "en", "es"]) {
		const localizedValue = value[locale];
		if (typeof localizedValue !== "string" || !localizedValue.trim()) {
			throw new Error(`${fieldName}.${locale} must be a non-empty string`);
		}
	}
}

export function validateConfig(config) {
	if (!Array.isArray(config) || config.length === 0) {
		throw new Error("config/wiki-pages.json must contain at least one page entry");
	}

	const seenSlugs = new Set();
	for (const entry of config) {
		if (typeof entry.category !== "string" || !entry.category.trim()) {
			throw new Error("config entry category must be a non-empty string");
		}

		if (typeof entry.slug !== "string" || !entry.slug.trim()) {
			throw new Error("config entry slug must be a non-empty string");
		}

		if (buildSlug(entry.slug, "") !== entry.slug) {
			throw new Error(`config entry slug "${entry.slug}" must already be lowercase ASCII-safe`);
		}

		if (seenSlugs.has(entry.slug)) {
			throw new Error(`duplicate config slug "${entry.slug}"`);
		}

		seenSlugs.add(entry.slug);

		const expectedPrefix = `${WIKI_SOURCE_ORIGIN}/index.php/`;
		if (typeof entry.url !== "string" || !entry.url.startsWith(expectedPrefix)) {
			throw new Error(`config entry "${entry.slug}" must use a ${WIKI_SOURCE_ORIGIN} page URL`);
		}

		validateLocalizedMap(entry.categoryLabel, `config.${entry.slug}.categoryLabel`);
		validateLocalizedMap(entry.title, `config.${entry.slug}.title`);

		if (entry.navigationPath !== undefined) {
			if (!Array.isArray(entry.navigationPath) || entry.navigationPath.length === 0) {
				throw new Error(`config.${entry.slug}.navigationPath must be a non-empty array when present`);
			}

			for (const part of entry.navigationPath) {
				if (typeof part !== "string" || !part.trim()) {
					throw new Error(`config.${entry.slug}.navigationPath must contain only non-empty strings`);
				}
			}
		}

		if (entry.pageKind !== undefined && (typeof entry.pageKind !== "string" || !entry.pageKind.trim())) {
			throw new Error(`config.${entry.slug}.pageKind must be a non-empty string when present`);
		}

		if (entry.children !== undefined) {
			if (!entry.children || typeof entry.children !== "object" || Array.isArray(entry.children)) {
				throw new Error(`config.${entry.slug}.children must be an object when present`);
			}

			if (!["discover-links", "discover-pokemon-api"].includes(entry.children.mode)) {
				throw new Error(`config.${entry.slug}.children.mode must be "discover-links" or "discover-pokemon-api"`);
			}

			for (const field of ["excludeSlugs", "excludeTitles"]) {
				if (entry.children[field] !== undefined) {
					if (!Array.isArray(entry.children[field])) {
						throw new Error(`config.${entry.slug}.children.${field} must be an array when present`);
					}

					for (const item of entry.children[field]) {
						if (typeof item !== "string" || !item.trim()) {
							throw new Error(`config.${entry.slug}.children.${field} must contain only non-empty strings`);
						}
					}
				}
			}

			for (const field of ["pageKind", "titlePrefix"]) {
				if (entry.children[field] !== undefined && (typeof entry.children[field] !== "string" || !entry.children[field].trim())) {
					throw new Error(`config.${entry.slug}.children.${field} must be a non-empty string when present`);
				}
			}

			if (entry.children.maxDepth !== undefined) {
				if (!Number.isInteger(entry.children.maxDepth) || entry.children.maxDepth < 1) {
					throw new Error(`config.${entry.slug}.children.maxDepth must be an integer >= 1 when present`);
				}
			}
		}
	}
}

async function pathExistsFreshHours(readPath, maxAgeHours) {
	try {
		const info = await stat(readPath);
		return (Date.now() - info.mtimeMs) < (maxAgeHours * 60 * 60 * 1000);
	} catch {
		return false;
	}
}

export function isTranslatedVariantTitle(value) {
	const title = value.trim();
	return /\((ES|EN|PT-BR|PT|BR)\)\s*$/i.test(title)
		|| /\b(ES|EN|PT-BR|PT|BR)\s*$/i.test(title);
}

const CONTENT_LIST_HEADING_TOKENS = [
	"indice",
	"index",
	"informacoes importantes",
	"informaciones importantes",
	"important information",
	"localizacao da rift",
	"rift location",
	"jardim de",
	"acessando o calabouco",
	"segunda etapa",
	"segredo",
	"boss alternativo",
];

export function isContentListHeading(value) {
	const normalized = value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

	return CONTENT_LIST_HEADING_TOKENS.some((token) => normalized.includes(token));
}

function looksLikeCraftPage(value) {
	return /\bcraft(s)?\b|craft\s+profiss/i.test(value);
}

function looksLikeWorkshopPage(value) {
	return /\bworkshop\b/i.test(value);
}

function looksLikeDungeonPage(value) {
	return /\bdungeons?\b/i.test(value);
}

function looksLikeMapPage(value) {
	return /\bmapa(s)?\b|\bmaps?\b/i.test(value);
}

function looksLikeQuestPage(value) {
	return /\bquests?\b|\bmissoes?\b|\bmission(s)?\b/i.test(value);
}

function looksLikeEventPage(value) {
	return /\beventos?\b|\bevents?\b|\bdefender\b/i.test(value);
}

function looksLikeNonItemPage(value) {
	return looksLikeQuestPage(value)
		|| looksLikeEventPage(value)
		|| looksLikeDungeonPage(value)
		|| /\bboss\b/i.test(value);
}

export function inferDiscoveredPageKind(defaultPageKind, link, titleValue) {
	const combined = `${titleValue} ${(link.headingPath || []).join(" ")}`;

	if (looksLikeWorkshopPage(combined)) return "workshop";
	if (looksLikeCraftPage(combined)) return "craft";
	if (looksLikeDungeonPage(combined)) return "dungeons";
	if (looksLikeMapPage(combined)) return "map";
	if (defaultPageKind === "item" && looksLikeQuestPage(combined)) return "quest";
	if (defaultPageKind === "item" && looksLikeEventPage(combined)) return "event";
	if (defaultPageKind === "item" && looksLikeNonItemPage(combined)) return "article";

	return defaultPageKind || "article";
}

function normalizeDiscoveryText(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

export function looksLikePokemonDiscoveryCandidate(title) {
	const raw = String(title ?? "").trim();
	if (!raw) return false;
	if (/\d/.test(raw)) return false;
	if (/[:/=]/.test(raw)) return false;
	if (raw.split(/\s+/).filter(Boolean).length > 4) return false;
	if (/\((?!TM\)|TR\))/i.test(raw)) return false;

	const words = normalizeDiscoveryText(raw).split(/[^a-z0-9]+/).filter(Boolean);
	if (!words.length) return false;
	if (words.some((word) => POKEMON_DISCOVERY_TOKEN_BLACKLIST.has(word))) return false;
	return true;
}

export function isPokemonSectionSignature(sections) {
	const tokens = new Set(
		(sections ?? [])
			.map((section) => normalizeDiscoveryText(String(section.line ?? "").replace(/<[^>]+>/g, " ")))
			.filter(Boolean)
	);

	return tokens.has("informacoes gerais")
		&& tokens.has("movimentos")
		&& tokens.has("efetividades");
}

async function fetchAllWikiPageTitles() {
	const titles = [];
	let apcontinue = "";

	while (true) {
		const payload = await fetchWikiApiJson({
			action: "query",
			list: "allpages",
			aplimit: "max",
			format: "json",
			apcontinue,
		});

		titles.push(...(payload?.query?.allpages ?? []).map((page) => String(page.title ?? "").trim()).filter(Boolean));
		apcontinue = payload?.continue?.apcontinue ?? "";
		if (!apcontinue) break;
	}

	return titles;
}

async function fetchPageSections(title) {
	const payload = await fetchWikiApiJson({
		action: "parse",
		page: title,
		prop: "sections",
		format: "json",
	});

	return payload?.parse?.sections ?? [];
}

async function discoverPokemonEntries(rootEntry) {
	if (!WIKI_DISCOVERY_FORCE && await pathExistsFreshHours(POKEMON_DISCOVERY_CACHE_PATH, WIKI_DISCOVERY_CACHE_HOURS)) {
		const cached = await readJson(POKEMON_DISCOVERY_CACHE_PATH);
		return cached.pages ?? [];
	}

	let stalePages = [];
	try {
		const cached = await readJson(POKEMON_DISCOVERY_CACHE_PATH);
		stalePages = cached.pages ?? [];
	} catch {
		stalePages = [];
	}

	try {
		const allTitles = await fetchAllWikiPageTitles();
		const candidates = allTitles.filter(looksLikePokemonDiscoveryCandidate);
		const pages = (await runWithConcurrency(candidates, WIKI_DISCOVERY_CONCURRENCY, async (title) => {
			const sections = await fetchPageSections(title);
			if (!isPokemonSectionSignature(sections)) return null;

			const slug = buildSlug(title, "");
			if (!slug) return null;

			return {
				category: "pokemon",
				categoryLabel: POKEMON_CATEGORY_LABEL,
				slug,
				url: `${WIKI_SOURCE_ORIGIN}/index.php/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
				title: buildLocalizedText(title),
				pageKind: "pokemon",
				navigationPath: ["Pokémon", title],
				discoveredBy: "pokemon-api",
				parentSlug: rootEntry.slug,
				pagePath: buildPagePath({
					category: "pokemon",
					slug,
					title: buildLocalizedText(title),
					pageKind: "pokemon",
					navigationPath: ["Pokémon", title],
				}),
			};
		})).filter(Boolean).sort((left, right) => left.slug.localeCompare(right.slug, "en"));

		await writeJson(POKEMON_DISCOVERY_CACHE_PATH, {
			generatedAt: new Date().toISOString(),
			pageCount: pages.length,
			pages,
		});

		return pages;
	} catch (error) {
		if (stalePages.length) {
			console.warn(`pokemon discovery failed, using stale cache: ${error instanceof Error ? error.message : error}`);
			return stalePages;
		}

		throw error;
	}
}

function isLikelyRecursiveBranchNode(entry) {
	const title = entry.title?.[PT_BR] || "";
	const normalized = title
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim();

	if (!normalized || normalized.includes(":") || normalized.includes("/")) {
		return false;
	}

	const words = normalized.split(/\s+/).filter(Boolean);
	return words.length <= 2;
}

export function shouldRecurseDiscoveredPage(entry, depth) {
	const pageKind = entry.pageKind || "";
	if (pageKind === "boss") {
		return false;
	}

	if (["workshop", "craft", "dungeons", "map", "artifact", "system"].includes(pageKind)) {
		return false;
	}

	if (isTranslatedVariantTitle(entry.title?.[PT_BR] || "")) {
		return false;
	}

	if (depth >= 2) {
		return isLikelyRecursiveBranchNode(entry);
	}

	return true;
}

// Wiki-wide hub pages get cross-referenced from all over the wiki ("veja Pokémon",
// "veja Clãs"). Adopting one as a child of whatever page happened to link it produces a
// junk entry that inherits the linking page's category and the link's label as its
// title — e.g. "Pokémon TM" filed under boss-fight, or the Clãs landing filed under
// quests as "Clan Tasks". They are never a child of another category.
const GLOBAL_HUB_SLUGS = new Set([
	"pokemon",
	"clas",
	"itens",
	"tarefas",
	"quests",
	"eventos",
	"sistemas",
	"profissoes",
	"npcs",
]);

export function shouldSkipDiscoveredLink({
	link,
	parentEntry,
	rootEntry,
	seenSlugs,
	excludeSlugs,
	excludeTitles,
}) {
	const childSlug = buildSlug(link.title, "");
	const rootCategory = rootEntry.category || "";
	const titleText = `${link.title} ${link.label}`;
	const isDimensionalDungeonLink = rootCategory === "dimensional-zone" && /^dz[-_\s]/i.test(link.title);
	const isLinkedImageCard = link.hasImage === true
		&& (
			(rootCategory === "daily-missions" && parentEntry.slug === rootEntry.slug)
			|| (rootCategory === "boss-fight" && ["boss-fight", "nightmare-terror"].includes(parentEntry.slug))
		);
	const embeddedTowerAlias = rootCategory === "embedded-tower"
		&& (
			/^embedded-tower-(en|es|pt|br)$/i.test(childSlug)
			|| /\b(primer|cuarto|quinto|sexto|septimo|piso|funcionamiento|recompensas\s+de\s+la)\b/i.test(normalizeDiscoveryText(titleText))
		);
	// A hub page is only legitimate when it is the root of its own category tree.
	const isForeignHubLink = GLOBAL_HUB_SLUGS.has(childSlug) && childSlug !== rootEntry.slug;
	return (
		!childSlug
		|| childSlug === parentEntry.slug
		|| childSlug === rootEntry.slug
		|| isForeignHubLink
		|| seenSlugs.has(childSlug)
		|| excludeSlugs.has(childSlug)
		|| excludeTitles.has(link.title)
		|| isTranslatedVariantTitle(link.title)
		|| isTranslatedVariantTitle(link.label)
		|| embeddedTowerAlias
		|| (!isDimensionalDungeonLink && !isLinkedImageCard && (link.headingPath || []).some(isContentListHeading))
	);
}

/// Crawls one seed in isolation and records every page it can reach, without claiming anything.
/// `seenSlugs` here is the seed's own visit set — it stops cycles inside this crawl and nothing
/// more. Ownership is decided afterwards by `resolveDiscoveryOwnership`.
async function discoverChildrenRecursive({
	parentEntry,
	rootEntry,
	childrenRule,
	depth,
	expanded,
	seenSlugs,
	discoveredEntries,
	candidates,
	configSlugs,
	seedIndex,
}) {
	const html = await fetchWikiHtml(parentEntry.url);
	if (!html) return;
	const articleHtml = extractArticleHtml(html);
	// Widget-driven index pages (Mystery Dungeons) list their children in a CMS_DATA
	// blob rather than <a> tags, so those entries are merged in here and go through the
	// same filtering as real links.
	const links = [
		...extractArticleWikiLinks(articleHtml, parentEntry.url),
		...cmsEntriesAsLinks(html, parentEntry.url),
	];
	const excludeSlugs = new Set(childrenRule.excludeSlugs || []);
	const excludeTitles = new Set(childrenRule.excludeTitles || []);

	for (const link of links) {
		const childSlug = buildSlug(link.title, "");
		if (shouldSkipDiscoveredLink({
			link,
			parentEntry,
			rootEntry,
			seenSlugs,
			excludeSlugs,
			excludeTitles,
		})) {
			continue;
		}

		const titleValue = childrenRule.titlePrefix
			? `${childrenRule.titlePrefix}${link.label}`
			: link.label;
		const baseNavigationPath = parentEntry.navigationPath || [parentEntry.title?.[PT_BR] || parentEntry.slug];
		const inferredPageKind = inferDiscoveredPageKind(childrenRule.pageKind, link, titleValue);
		const childEntry = {
			category: rootEntry.category,
			categoryLabel: rootEntry.categoryLabel,
			slug: childSlug,
			url: link.url,
			title: buildLocalizedText(titleValue),
			navigationPath: mergeNavigationPath(baseNavigationPath, link.headingPath || [], link.label),
			pageKind: inferredPageKind,
		};

		// Recorded as a candidate, not claimed. A page reachable from several seeds is offered by
		// each of them and resolved once, afterwards.
		if (!configSlugs.has(childSlug)) {
			const existing = candidates.get(childSlug);
			// The seed that reaches a page most directly owns it; config order breaks ties. Both
			// halves are deterministic, which is the whole point.
			if (!existing || depth < existing.depth || (depth === existing.depth && seedIndex < existing.seedIndex)) {
				candidates.set(childSlug, {
					depth,
					seedIndex,
					entry: childEntry,
					discovered: {
						parentSlug: rootEntry.slug,
						discoveredFromSlug: parentEntry.slug,
						slug: childSlug,
						url: link.url,
						title: childEntry.title,
						navigationPath: childEntry.navigationPath,
						pageKind: childEntry.pageKind,
						pagePath: buildPagePath(childEntry),
					},
				});
			}
		}

		seenSlugs.add(childSlug);

		if (depth < (childrenRule.maxDepth || 1) && shouldRecurseDiscoveredPage(childEntry, depth)) {
			await discoverChildrenRecursive({
				parentEntry: childEntry,
				rootEntry,
				childrenRule,
				depth: depth + 1,
				expanded,
				seenSlugs,
				discoveredEntries,
				candidates,
				configSlugs,
				seedIndex,
			});
		}
	}
}

/// Picks one owner per discovered slug. Sorted so the output order is stable regardless of which
/// crawl happened to finish first.
export function resolveDiscoveryOwnership(candidates) {
	return [...candidates.values()].sort(
		(left, right) =>
			left.seedIndex - right.seedIndex
			|| left.depth - right.depth
			|| left.entry.slug.localeCompare(right.entry.slug),
	);
}

export async function expandConfigWithDiscoveredChildren(config) {
	const expanded = [];
	const seenSlugs = new Set(config.map((entry) => entry.slug));
	const processedSlugs = new Set();
	const discoveredEntries = [];

	for (const entry of config) {
		if (processedSlugs.has(entry.slug)) {
			throw new Error(`duplicate config slug "${entry.slug}" after expansion`);
		}
		expanded.push(entry);
		processedSlugs.add(entry.slug);
	}

	// Two phases, because ownership and traversal are different questions.
	//
	// Seeds used to share one mutable `seenSlugs`, so a page belonged to whichever crawl reached
	// it first — a race whose winner changed run to run. The real damage was not the wrong
	// category: a seed that had already hit its own `maxDepth` still claimed the slug and then
	// never recursed, so every child beneath it silently disappeared. That cost the published
	// bundle 75 item pages, and made `nightmare-world` swing between 45 and 17 pages on identical
	// input.
	//
	// Ordering the seeds cannot fix this. Both orderings were measured and both are wrong:
	// running catalogues first sends ~600 pages to items/quests, running areas first sends
	// nightmare-world from 45 to 270. The wiki's link graph reaches most pages from several
	// directions, so no single traversal order is correct.
	//
	// So each seed now crawls independently and records candidates, and ownership is resolved once
	// at the end: shallowest depth wins, config order breaks ties. No seed can block another's
	// traversal, which removes the cascading child loss entirely, and the result is deterministic.
	// Repeat fetches of a shared page are served by the per-run HTML cache.
	const configSlugs = new Set(config.map((entry) => entry.slug));
	const candidates = new Map();
	const discoverEntries = config
		.map((entry, index) => ({ entry, index }))
		.filter(({ entry }) => entry.children?.mode === "discover-links");

	await runWithConcurrency(discoverEntries, WIKI_DISCOVERY_CONCURRENCY, ({ entry, index }) =>
		discoverChildrenRecursive({
			parentEntry: entry,
			rootEntry: entry,
			childrenRule: entry.children,
			depth: 1,
			expanded,
			// Per-seed visit set: stops cycles inside this crawl, and nothing else.
			seenSlugs: new Set(configSlugs),
			discoveredEntries,
			candidates,
			configSlugs,
			seedIndex: index,
		})
	);

	for (const { entry, discovered } of resolveDiscoveryOwnership(candidates)) {
		if (seenSlugs.has(entry.slug)) continue;
		expanded.push(entry);
		seenSlugs.add(entry.slug);
		discoveredEntries.push(discovered);
	}

	const pokemonDiscoverRoots = config.filter((entry) => entry.children?.mode === "discover-pokemon-api");
	for (const rootEntry of pokemonDiscoverRoots) {
		const pokemonEntries = await discoverPokemonEntries(rootEntry);
		for (const entry of pokemonEntries) {
			if (seenSlugs.has(entry.slug)) continue;
			expanded.push(entry);
			seenSlugs.add(entry.slug);
			discoveredEntries.push({
				parentSlug: rootEntry.slug,
				discoveredFromSlug: rootEntry.slug,
				slug: entry.slug,
				url: entry.url,
				title: entry.title,
				navigationPath: entry.navigationPath,
				pageKind: entry.pageKind,
				pagePath: entry.pagePath,
				discoveredBy: "pokemon-api",
			});
		}
	}

	await writeJson(DISCOVERED_CONFIG_PATH, discoveredEntries);
	return expanded;
}

export async function loadConfig() {
	const config = await readJson(CONFIG_PATH);
	validateConfig(config);
	return expandConfigWithDiscoveredChildren(config);
}
