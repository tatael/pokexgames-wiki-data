import path from "node:path";
import { copyFile } from "node:fs/promises";

import {
	DIST_BUILD_DIR,
	PAGES_BUILD_DIR,
	PT_BR,
	SCHEMA_VERSION,
	SOURCE_NAME,
	WIKI_REFRESH,
	WIKI_SKIP_VALIDATE,
	WIKI_SYNC_CATEGORY,
	WIKI_SYNC_CONCURRENCY,
	WIKI_SYNC_ONLY,
	buildPagePath,
	nowRfc3339,
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
	extractSections,
	extractTitle,
} from "./lib/extract.mjs";
import {
	discoverPageImages,
	extractPageImages,
	extractLeadWikiImageUrl,
} from "./lib/images.mjs";
import { loadConfig } from "./lib/discovery.mjs";
import { prepareBuildDir, publishBuildDir } from "./lib/output.mjs";
import {
	buildLocalizedSummary,
	normalizeSections,
	resolveCategory,
	resolveCategoryLabel,
	resolveDisplayTitle,
	resolveDisplayInList,
	resolvePageGroup,
	resolvePokemonProfile,
	resolveSortRank,
	resolveTitleOverride,
} from "./lib/page-pipeline.mjs";
import { validateBundle } from "./lib/validation.mjs";

const TERRITORY_GUARDIAN_BANNERS = {
	dorabelle: "https://wiki.pokexgames.com/images/thumb/7/7f/Banner_Bolinha_MD_-_Dorabelle%27s_Wrath.webp/308px-Banner_Bolinha_MD_-_Dorabelle%27s_Wrath.webp.png",
	"giant-tyranitar": "https://wiki.pokexgames.com/images/thumb/1/1f/Banner_Bolinha_MD_-_The_Darkness.webp/308px-Banner_Bolinha_MD_-_The_Darkness.webp.png",
	"giant-dragonair": "https://wiki.pokexgames.com/images/thumb/a/ab/Banner_Bolinha_MD_-_The_Celestial_Serpent.webp/308px-Banner_Bolinha_MD_-_The_Celestial_Serpent.webp.png",
	"giant-mamoswine": "https://wiki.pokexgames.com/images/thumb/9/92/Banner_Bolinha_MD_-_Below_Zero.webp/308px-Banner_Bolinha_MD_-_Below_Zero.webp.png",
	"giant-magcargo": "https://wiki.pokexgames.com/images/thumb/9/98/Banner_Bolinha_MD_-_The_Magma_Insurgency.webp/308px-Banner_Bolinha_MD_-_The_Magma_Insurgency.webp.png",
};

const PAGE_IMAGE_OVERRIDES = {
	"king-charizard-dungeon": "https://wiki.pokexgames.com/images/thumb/9/90/Banner_Bolinha_King_Charizard.png/250px-Banner_Bolinha_King_Charizard.png",
};

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
	return hero ? { hero } : null;
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

	const articleHtml = extractArticleFragmentHtml(extractArticleHtml(html), sourceFragment);
	const fallbackTitle = entry.title?.[PT_BR] || entry.slug;
	const resolvedTitle = fallbackTitle || extractTitle(html, entry.slug);
	const sectionsBase = extractSections(articleHtml, resolvedTitle, sourceUrl.toString());
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
	const displayTitle = profileTitle
		?? resolveTitleOverride({ category: resolvedCategory, slug: entry.slug })
		?? resolveDisplayTitle(entry.title, resolvedCategoryLabel);
	const fallbackSummary = displayTitle?.[PT_BR] || entry.title?.[PT_BR] || resolvedTitle || entry.slug;
	const summary = buildLocalizedSummary(rawSummary, fallbackSummary);
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
		...(images ? { images } : {}),
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
			...(images ? { images } : {}),
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
