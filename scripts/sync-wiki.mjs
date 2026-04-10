import path from "node:path";

import {
	PAGES_DIR,
	PT_BR,
	SCHEMA_VERSION,
	SOURCE_NAME,
	buildSlug,
	buildSummary,
	buildPagePath,
	cleanDist,
	extractArticleHtml,
	extractArticleFragmentHtml,
	extractSections,
	extractTitle,
	fetchWikiHtml,
	loadConfig,
	nowRfc3339,
	runWithConcurrency,
	validateBundle,
	writeJson
} from "./lib/wiki.mjs";

function mirrorLocalizedText(value) {
	return {
		[PT_BR]: value,
		en: value,
		es: value
	};
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
	const slug = buildSlug(entry.slug, buildSlug(resolvedTitle, "wiki-page"));
	const sectionsBase = extractSections(articleHtml, resolvedTitle);
	const summary = buildSummary(sectionsBase);
	const fetchedAt = nowRfc3339();

	const sections = sectionsBase.map((section) => ({
		...section,
		heading: mirrorLocalizedText(section.heading[PT_BR] || ""),
		paragraphs: {
			[PT_BR]: section.paragraphs[PT_BR] || [],
			en: section.paragraphs[PT_BR] || [],
			es: section.paragraphs[PT_BR] || []
		},
		items: {
			[PT_BR]: section.items[PT_BR] || [],
			en: section.items[PT_BR] || [],
			es: section.items[PT_BR] || []
		}
	}));

	const page = {
		category: entry.category,
		slug,
		url: entry.url,
		source: SOURCE_NAME,
		fetchedAt,
		title: entry.title,
		summary: {
			[PT_BR]: summary[PT_BR],
			en: summary[PT_BR],
			es: summary[PT_BR]
		},
		sections,
		metadata: {
			sourceType: "wiki-sync",
			pageKind: entry.pageKind || "article",
			navigationPath: Array.isArray(entry.navigationPath) ? entry.navigationPath.join(" > ") : "",
			sourceFragment
		}
	};

	const pagePath = buildPagePath({
		category: entry.category,
		navigationPath: entry.navigationPath,
		title: entry.title,
		slug
	});

	await writeJson(path.join(PAGES_DIR, ...pagePath.split("/")), page);

	return {
		categoryId: entry.category,
		categoryLabel: entry.categoryLabel,
		pageEntry: {
			category: entry.category,
			slug,
			url: entry.url,
			title: entry.title,
			summary: page.summary,
			fetchedAt,
			pagePath
		}
	};
}

async function main() {
	await cleanDist();
	const config = await loadConfig();

	const categoriesMap = new Map();
	const pages = [];

	const results = await runWithConcurrency(config, 6, syncEntry);
	for (const result of results) {
		if (!result) continue;
		categoriesMap.set(result.categoryId, { id: result.categoryId, label: result.categoryLabel });
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
		pages
	};

	await writeJson(path.join(process.cwd(), "dist", "manifest.json"), manifest);
	await validateBundle();

	console.log(`Synced ${pages.length} wiki pages into dist/.`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
