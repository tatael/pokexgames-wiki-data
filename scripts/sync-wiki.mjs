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

async function resolvePageImages({ articleHtml, sourceUrl, slug, pageKind }) {
	const images = extractPageImages(articleHtml, sourceUrl.toString(), slug);
	if (pageKind !== "pokemon") {
		const leadSpriteUrl = extractLeadWikiImageUrl(articleHtml, sourceUrl.toString(), "sprite");
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
	const displayTitle = resolveTitleOverride({ category: resolvedCategory, slug: entry.slug })
		?? resolveDisplayTitle(entry.title, resolvedCategoryLabel);
	const fallbackSummary = displayTitle?.[PT_BR] || entry.title?.[PT_BR] || resolvedTitle || entry.slug;
	const summary = buildLocalizedSummary(rawSummary, fallbackSummary);
	const images = await resolvePageImages({
		articleHtml,
		sourceUrl,
		slug: entry.slug,
		pageKind,
	});

	const sortRank = resolveSortRank({ category: resolvedCategory, slug: entry.slug, title: displayTitle });
	const navigationPath = Array.isArray(entry.navigationPath) ? entry.navigationPath : [];
	const pageGroup = resolvePageGroup({
		category: resolvedCategory,
		slug: entry.slug,
		title: displayTitle,
		navigationPath,
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
			...(sortRank !== null ? { sortRank } : {}),
			...(displayInList === false ? { displayInList } : {}),
			...(pageGroup ? { pageGroup } : {}),
			...(profile ? { profile } : {}),
			...(images ? { images } : {}),
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
