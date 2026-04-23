import path from "node:path";
import { copyFile } from "node:fs/promises";

import {
	DIST_BUILD_DIR,
	PAGES_BUILD_DIR,
	PT_BR,
	SCHEMA_VERSION,
	SOURCE_NAME,
	WIKI_SYNC_CONCURRENCY,
	buildPagePath,
	nowRfc3339,
	writeJson,
} from "./lib/shared.mjs";
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
		pieces.push(section.heading?.[PT_BR]);
		pieces.push(...(section.paragraphs?.[PT_BR] ?? []));
		pieces.push(...(section.items?.[PT_BR] ?? []));
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

	const html = await fetchWikiHtml(sourceUrl.toString());
	if (!html) {
		console.warn(`skipping ${entry.slug}: page not found (${entry.url})`);
		return null;
	}

	const articleHtml = extractArticleFragmentHtml(extractArticleHtml(html), sourceFragment);
	const fallbackTitle = entry.title?.[PT_BR] || entry.slug;
	const resolvedTitle = fallbackTitle || extractTitle(html, entry.slug);
	const sectionsBase = extractSections(articleHtml, resolvedTitle, sourceUrl.toString());
	const sections = normalizeSections(sectionsBase);
	const fetchedAt = nowRfc3339();
	const profile = resolvePokemonProfile(sections);
	const resolvedCategory = resolveCategory(entry.category, entry.slug, profile, entry);
	const resolvedCategoryLabel = resolveCategoryLabel(resolvedCategory, entry.categoryLabel);
	const pageKind = profile ? "pokemon" : (entry.pageKind || "article");
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
	});

	const page = {
		category: resolvedCategory,
		slug: entry.slug,
		url: entry.url,
		source: SOURCE_NAME,
		fetchedAt,
		pageKind,
		title: displayTitle,
		summary,
		...(searchText ? { searchText } : {}),
		...(sortRank !== null ? { sortRank } : {}),
		...(displayInList === false ? { displayInList } : {}),
		...(pageGroup ? { pageGroup } : {}),
		...(profile ? { profile } : {}),
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
			title: displayTitle,
			summary,
			...(searchText ? { searchText } : {}),
			...(sortRank !== null ? { sortRank } : {}),
			...(displayInList === false ? { displayInList } : {}),
			...(pageGroup ? { pageGroup } : {}),
			...(profile ? { profile } : {}),
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
	const categoriesMap = new Map();
	const pages = [];

	const results = await runWithConcurrency(config, WIKI_SYNC_CONCURRENCY, syncEntry);
	for (const result of results) {
		if (!result) continue;
		categoriesMap.set(result.categoryId, {
			id: result.categoryId,
			label: result.categoryLabel,
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
	};

	await writeJson(path.join(DIST_BUILD_DIR, "manifest.json"), manifest);
	await copyFile(
		path.join(process.cwd(), "scripts", "templates", "index.html"),
		path.join(DIST_BUILD_DIR, "index.html")
	);

	await validateBundle(DIST_BUILD_DIR);
	await publishBuildDir();

	console.log(`Synced ${pages.length} wiki pages into dist/.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
