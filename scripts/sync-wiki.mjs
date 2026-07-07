import path from "node:path";
import { copyFile, readFile } from "node:fs/promises";

import { synthesizeItemPages } from "./lib/synthesize-item-pages.mjs";

import {
	DIST_BUILD_DIR,
	PAGES_BUILD_DIR,
	PT_BR,
	ROOT_DIR,
	SCHEMA_VERSION,
	SOURCE_NAME,
	WIKI_REFRESH,
	WIKI_SKIP_VALIDATE,
	WIKI_SYNC_CATEGORY,
	WIKI_SYNC_CONCURRENCY,
	WIKI_SYNC_ONLY,
	buildPagePath,
	nowRfc3339,
	readJson,
	writeJson,
} from "./lib/shared.mjs";
import { compactLocalizedValueMap } from "./lib/localized.mjs";
import { buildMediaRegistry } from "./lib/media-registry.mjs";
import { buildCanonicalRegistries } from "./lib/canonical-registries.mjs";
import { fetchWikiHtml, runWithConcurrency } from "./lib/transport.mjs";
import {
	buildSummary,
	extractArticleHtml,
	extractArticleFragmentHtml,
	extractGuardianBossSectionsHtml,
	extractSections,
	extractTitle,
} from "./lib/extract.mjs";
import {
	buildFlexTaskSections,
	extractFlexTasksData,
	isFlexTasksPage,
} from "./lib/extract-flex-tasks.mjs";
import {
	discoverPageImages,
	extractPageImages,
	extractLeadWikiImageUrl,
} from "./lib/images.mjs";
import { loadConfig } from "./lib/discovery.mjs";
import { prepareBuildDir, publishBuildDir } from "./lib/output.mjs";
import {
	buildLocalizedSummary,
	buildLocalizedPageSummary,
	normalizeSections,
	resolveCategory,
	resolveCategoryLabel,
	resolveDisplayTitle,
	resolveDisplayInList,
	resolvePageGroup,
	resolvePokemonProfile,
	resolvePokemonForms,
	resolveSortRank,
	resolveTitleOverride,
} from "./lib/page-pipeline.mjs";
import { validateBundle } from "./lib/validation.mjs";
import { extractQuestMetadata } from "./lib/transform/quest-metadata.mjs";

const { pageImageOverrides: PAGE_IMAGE_OVERRIDES, territoryGuardianBanners: TERRITORY_GUARDIAN_BANNERS } =
	await readJson(path.join(ROOT_DIR, "config", "image-overrides.json"));

// Shiny/Mega Pokémon pages often expose only the base name in their profile (e.g. Shiny Abra's
// profile says "Nome: Abra"), which would render a duplicate base-name card in the Pokémon list.
// Prefix the variant word from the slug/url when the resolved title lacks it.
function applyPokemonVariantTitle(title, { slug = "", url = "", profile = null } = {}) {
	if (!title || !profile) return title;
	const hint = `${slug} ${url}`.toLowerCase().replace(/[-_]+/g, " ");
	let prefix = "";
	if (/\bshiny\b/.test(hint)) prefix = "Shiny";
	else if (/\bmega\b/.test(hint)) prefix = "Mega";
	if (!prefix) return title;
	const has = new RegExp(`\\b${prefix}\\b`, "i");
	return Object.fromEntries(
		Object.entries(title).map(([locale, value]) => {
			const text = String(value ?? "").trim();
			if (!text || has.test(text)) return [locale, value];
			return [locale, `${prefix} ${text}`];
		})
	);
}

function mergeFlexTaskSections(baseSections, articleHtml, { slug }) {
	const rawTasks = extractFlexTasksData(articleHtml);
	const flexSections = buildFlexTaskSections(rawTasks, { slug });
	if (!flexSections.length) return baseSections;
	const introSections = (baseSections ?? []).filter((section) => {
		const id = String(section?.id ?? "").toLowerCase();
		return id === "introducao" || id.startsWith("introdu");
	});
	return [...introSections, ...flexSections];
}

function buildSearchText(page) {
	const pieces = [
		page.title?.[PT_BR],
		page.summary?.[PT_BR],
		page.pageGroup?.[PT_BR],
		...(page.navigationPath ?? []),
	];

	for (const section of page.sections ?? []) {
		pieces.push(section.title?.[PT_BR] ?? section.heading?.[PT_BR]);
		const content = section.content?.[PT_BR] ?? {};
		pieces.push(...(content.paragraphs ?? section.paragraphs?.[PT_BR] ?? []));
		pieces.push(...(content.list ?? section.items?.[PT_BR] ?? []));
		for (const fact of section.facts?.[PT_BR] ?? []) {
			pieces.push(fact?.label, fact?.value);
		}

		for (const task of section.tasks?.[PT_BR] ?? []) {
			pieces.push(task?.title, task?.npc, task?.objective);
		}

		for (const reward of section.rewards?.[PT_BR] ?? []) {
			pieces.push(reward?.name, reward?.difficulty, reward?.rarity, reward?.qty, reward?.place);
			for (const prize of reward?.prizes ?? []) pieces.push(prize?.name, prize?.qty);
		}

		for (const pokemon of section.pokemon?.[PT_BR] ?? []) {
			pieces.push(pokemon?.name, pokemon?.pve, pokemon?.pvp);
		}

		for (const moveGroup of section.moves?.[PT_BR] ?? []) {
			pieces.push(moveGroup?.label);
			for (const row of moveGroup?.rows ?? []) pieces.push(row?.name, row?.cooldown, ...(row?.traits ?? []));
		}
	}

	const text = pieces
		.flatMap((value) => Array.isArray(value) ? value : [value])
		.map((value) => String(value ?? "").trim())
		.filter(Boolean)
		.join(" ");
	return text ? { [PT_BR]: text, en: text, es: text } : null;
}

async function resolvePageImages({ articleHtml, sourceUrl, slug, pageKind, category }) {
	if (PAGE_IMAGE_OVERRIDES[slug]) {
		const url = PAGE_IMAGE_OVERRIDES[slug];
		return {
			sprite: { url },
			hero: { url },
		};
	}

	if (category === "territory-guardians" && pageKind === "guardian-boss" && TERRITORY_GUARDIAN_BANNERS[slug]) {
		const url = TERRITORY_GUARDIAN_BANNERS[slug];
		return {
			sprite: { url },
			hero: { url },
		};
	}

	const images = extractPageImages(articleHtml, sourceUrl.toString(), slug);
	if (pageKind !== "pokemon") {
		const leadSpriteUrl = extractLeadWikiImageUrl(articleHtml, sourceUrl.toString(), "sprite");
		if (category === "territory-guardians" && pageKind === "guardian-boss" && leadSpriteUrl) {
			return {
				...(images ?? {}),
				sprite: { url: leadSpriteUrl },
				hero: { url: leadSpriteUrl },
			};
		}

		if (!leadSpriteUrl) return images;
		return {
			...(images ?? {}),
			sprite: images?.sprite ?? { url: leadSpriteUrl },
			hero: { url: leadSpriteUrl },
		};
	}

	const leadHeroUrl = extractLeadWikiImageUrl(articleHtml, sourceUrl.toString(), "hero");
	const discoveredImages = leadHeroUrl || images?.hero || images?.sprite
		? null
		: await discoverPageImages(slug);
	const hero = leadHeroUrl
		? { url: leadHeroUrl }
		: (images?.hero ?? images?.sprite ?? discoveredImages?.hero ?? discoveredImages?.sprite ?? null);
	const sprite = images?.sprite ?? discoveredImages?.sprite ?? hero;
	return hero ? { ...(sprite ? { sprite } : {}), hero } : null;
}

async function syncEntry(entry) {
	const sourceUrl = new URL(entry.url);
	const sourceFragment = sourceUrl.hash ? decodeURIComponent(sourceUrl.hash.slice(1)) : "";
	sourceUrl.hash = "";
	const shouldRefresh = WIKI_REFRESH.includes(entry.slug) || WIKI_REFRESH.includes(entry.url);

	let html = null;
	try {
		html = await fetchWikiHtml(sourceUrl.toString(), {
			cacheKey: entry.slug,
			refresh: shouldRefresh,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`skipping ${entry.slug}: failed to fetch page (${message})`);
		return null;
	}

	if (!html) {
		console.warn(`skipping ${entry.slug}: page not found (${entry.url})`);
		return null;
	}

	const fullArticleHtml = extractArticleHtml(html);
	const guardianHtml = entry.category === "territory-guardians" && entry.pageKind === "guardian-boss"
		? extractGuardianBossSectionsHtml(fullArticleHtml, entry.title?.[PT_BR] || entry.slug)
		: null;
	const articleHtml = guardianHtml ?? extractArticleFragmentHtml(fullArticleHtml, sourceFragment);
	const fallbackTitle = entry.title?.[PT_BR] || entry.slug;
	const resolvedTitle = fallbackTitle || extractTitle(html, entry.slug);
	const baseSections = extractSections(articleHtml, resolvedTitle, sourceUrl.toString());
	// The flex-task data lives in a <script> (window.quests.*), which extractArticleHtml
	// strips — read it from the raw page html instead.
	const sectionsBase = isFlexTasksPage(html, { category: entry.category })
		? mergeFlexTaskSections(baseSections, html, { slug: entry.slug })
		: baseSections;
	const provisionalSections = normalizeSections(sectionsBase, {
		category: entry.category,
		slug: entry.slug,
		pageKind: entry.pageKind || "article",
	});

	const fetchedAt = nowRfc3339();
	const profile = resolvePokemonProfile(provisionalSections);
	const resolvedCategory = resolveCategory(entry.category, entry.slug, profile, entry);
	const resolvedCategoryLabel = resolveCategoryLabel(resolvedCategory, entry.categoryLabel);
	const pageKind = profile ? "pokemon" : (entry.pageKind || "article");
	const sections = normalizeSections(sectionsBase, {
		category: resolvedCategory,
		slug: entry.slug,
		pageKind,
	});

	const rawSummary = buildSummary(sectionsBase);
	const profileTitle = profile
		? Object.fromEntries(Object.entries(profile).map(([locale, value]) => [locale, value?.name]).filter(([, value]) => value))
		: null;
	const displayTitle = applyPokemonVariantTitle(
		profileTitle
			?? resolveTitleOverride({ category: resolvedCategory, slug: entry.slug })
			?? resolveDisplayTitle(entry.title, resolvedCategoryLabel),
		{ slug: entry.slug, url: entry.url, profile },
	);
	const fallbackSummary = displayTitle?.[PT_BR] || entry.title?.[PT_BR] || resolvedTitle || entry.slug;
	const summary = buildLocalizedPageSummary(rawSummary, fallbackSummary, sections);
	const images = await resolvePageImages({
		articleHtml,
		sourceUrl,
		slug: entry.slug,
		pageKind,
		category: resolvedCategory,
	});

	const sortRank = resolveSortRank({ category: resolvedCategory, slug: entry.slug, title: displayTitle });
	const navigationPath = Array.isArray(entry.navigationPath) ? entry.navigationPath : [];
	const pageGroup = resolvePageGroup({
		category: resolvedCategory,
		slug: entry.slug,
		title: displayTitle,
		navigationPath,
	});

	const searchText = buildSearchText({
		title: displayTitle,
		summary,
		pageGroup,
		navigationPath,
		sections,
	});

	const displayInList = resolveDisplayInList({
		category: resolvedCategory,
		slug: entry.slug,
		title: displayTitle,
		pageKind,
		navigationPath,
	});

	const pagePath = buildPagePath({
		category: resolvedCategory,
		navigationPath: entry.navigationPath,
		title: entry.title,
		slug: entry.slug,
		pageKind,
		pageGroup,
	});

	const questMetadata = resolvedCategory === "quests"
		? extractQuestMetadata({ sections, navigationPath: entry.navigationPath ?? [] })
		: null;
	const pokemonForms = resolvePokemonForms({
		slug: entry.slug,
		title: displayTitle,
		profile,
		pageKind,
	});

	const page = {
		category: resolvedCategory,
		slug: entry.slug,
		url: entry.url,
		source: SOURCE_NAME,
		fetchedAt,
		pageKind,
		title: compactLocalizedValueMap(displayTitle),
		summary: compactLocalizedValueMap(summary),
		...(sortRank !== null ? { sortRank } : {}),
		...(displayInList === false ? { displayInList } : {}),
		...(pageGroup ? { pageGroup: compactLocalizedValueMap(pageGroup) } : {}),
		...(profile ? { profile: compactLocalizedValueMap(profile) } : {}),
		...(pokemonForms ? { pokemonForms } : {}),
		...(images ? { images } : {}),
		...(questMetadata ? { questMetadata } : {}),
		sections,
		metadata: {
			sourceType: "wiki-sync",
			pageKind,
			navigationPath: Array.isArray(entry.navigationPath) ? entry.navigationPath.join(" > ") : "",
			sourceFragment,
		},
	};

	await writeJson(path.join(PAGES_BUILD_DIR, ...pagePath.split("/")), page);

	return {
		categoryId: resolvedCategory,
		categoryLabel: resolvedCategoryLabel,
		pageEntry: {
			category: resolvedCategory,
			slug: entry.slug,
			url: entry.url,
			pageKind,
			title: compactLocalizedValueMap(displayTitle),
			summary: compactLocalizedValueMap(summary),
			...(searchText ? { searchText: compactLocalizedValueMap(searchText) } : {}),
			...(sortRank !== null ? { sortRank } : {}),
			...(displayInList === false ? { displayInList } : {}),
			...(pageGroup ? { pageGroup: compactLocalizedValueMap(pageGroup) } : {}),
			...(profile ? { profile: compactLocalizedValueMap(profile) } : {}),
			...(pokemonForms ? { pokemonForms } : {}),
			...(images ? { images } : {}),
			...(questMetadata ? { questMetadata } : {}),
			...(navigationPath.length ? { navigationPath } : {}),
			fetchedAt,
			pagePath,
		},
	};
}

async function main() {
	await prepareBuildDir();
	const config = await loadConfig();
	const onlySet = new Set(WIKI_SYNC_ONLY);
	const categorySet = new Set(WIKI_SYNC_CATEGORY);
	const filteredConfig = config.filter((entry) => {
		if (onlySet.size && !onlySet.has(entry.slug) && !onlySet.has(entry.url)) return false;
		if (categorySet.size && !categorySet.has(entry.category)) return false;
		return true;
	});

	if (!filteredConfig.length) {
		throw new Error("sync filters matched zero pages");
	}

	const categoriesMap = new Map();
	const pages = [];

	const results = await runWithConcurrency(filteredConfig, WIKI_SYNC_CONCURRENCY, syncEntry);
	for (const result of results) {
		if (!result) continue;
		categoriesMap.set(result.categoryId, {
			id: result.categoryId,
			label: compactLocalizedValueMap(result.categoryLabel),
		});
		pages.push(result.pageEntry);
	}

	pages.sort((left, right) => {
		const leftTitle = left.title?.[PT_BR] || "";
		const rightTitle = right.title?.[PT_BR] || "";
		return left.category.localeCompare(right.category) || leftTitle.localeCompare(rightTitle);
	});

	const manifest = {
		schemaVersion: SCHEMA_VERSION,
		source: SOURCE_NAME,
		updatedAt: nowRfc3339(),
		categories: [...categoriesMap.values()],
		pages,
		mediaPath: "media.json",
		registries: {
			items: "registries/items.json",
			pokemon: "registries/pokemon.json",
			npcs: "registries/npcs.json",
			definitions: "registries/definitions.json",
			linkedCards: "registries/linked-cards.json",
		},
	};

	const mediaRegistry = await buildMediaRegistry(
		pages.map((page) => page.pagePath),
		PAGES_BUILD_DIR
	);

	// Keep the Itens category to individual items: split index/landing pages (cameras, …) into
	// per-item pages, then hide the landing/index pages and any dungeon-walkthrough pages that
	// were miscategorised as items.
	const { newEntries, recategorized, hideSlugs } = await synthesizeItemPages({
		pages,
		pagesDir: PAGES_BUILD_DIR,
		mediaEntries: mediaRegistry.entries,
	});
	for (const entry of newEntries) pages.push(entry);
	// Pull existing-but-hidden/other-category item pages (e.g. event cameras) into Itens.
	const pagesBySlug = new Map(pages.map((page) => [page.slug, page]));
	for (const { slug, group } of recategorized) {
		const entry = pagesBySlug.get(slug);
		if (!entry?.pagePath) continue;
		entry.category = "items";
		if (group) entry.pageGroup = group;
		delete entry.displayInList;
		try {
			const filePath = path.join(PAGES_BUILD_DIR, ...entry.pagePath.split("/"));
			const pageJson = JSON.parse(await readFile(filePath, "utf8"));
			pageJson.category = "items";
			if (group) pageJson.pageGroup = group;
			delete pageJson.displayInList;
			await writeJson(filePath, pageJson);
		} catch { /* ignore unreadable page */ }
	}
	const hiddenItemSlugs = new Set([...hideSlugs, "big-figures", "ancient-temple"]);
	for (const page of pages) {
		if (page.category !== "items" || !page.pagePath || hiddenItemSlugs.has(page.slug)) continue;
		try {
			const pageJson = JSON.parse(await readFile(path.join(PAGES_BUILD_DIR, ...page.pagePath.split("/")), "utf8"));
			if ((pageJson.sections ?? []).some((section) => /^boss-|^localizacao-da-rift$|^primeira-etapa$|^acessando-o-calabouco$/.test(String(section.id ?? "")))) {
				hiddenItemSlugs.add(page.slug);
			}
		} catch { /* ignore unreadable page */ }
	}
	for (const page of pages) {
		if (!hiddenItemSlugs.has(page.slug)) continue;
		page.displayInList = false;
		// Keep the on-disk page in sync with the manifest entry (the bundle validator checks it).
		if (!page.pagePath) continue;
		try {
			const filePath = path.join(PAGES_BUILD_DIR, ...page.pagePath.split("/"));
			const pageJson = JSON.parse(await readFile(filePath, "utf8"));
			pageJson.displayInList = false;
			await writeJson(filePath, pageJson);
		} catch { /* ignore unreadable page */ }
	}

	pages.sort((left, right) => {
		const leftTitle = left.title?.[PT_BR] || "";
		const rightTitle = right.title?.[PT_BR] || "";
		return left.category.localeCompare(right.category) || leftTitle.localeCompare(rightTitle);
	});
	manifest.pages = pages;

	await buildCanonicalRegistries(
		pages.map((page) => page.pagePath),
		PAGES_BUILD_DIR,
		DIST_BUILD_DIR
	);

	await writeJson(path.join(DIST_BUILD_DIR, "manifest.json"), manifest);
	await writeJson(path.join(DIST_BUILD_DIR, "media.json"), mediaRegistry);
	await copyFile(
		path.join(process.cwd(), "scripts", "templates", "index.html"),
		path.join(DIST_BUILD_DIR, "index.html")
	);

	if (!WIKI_SKIP_VALIDATE) {
		await validateBundle(DIST_BUILD_DIR);
	}

	await publishBuildDir();

	console.log(`Synced ${pages.length} wiki pages into dist/.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
