import path from "node:path";

import {
  PAGES_DIR,
  PT_BR,
  SCHEMA_VERSION,
  SOURCE_NAME,
  buildSlug,
  buildSummary,
  cleanDist,
  extractArticleHtml,
  extractSections,
  extractTitle,
  fetchWikiHtml,
  loadConfig,
  nowRfc3339,
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

async function main() {
  const config = await loadConfig();
  await cleanDist();

  const categoriesMap = new Map();
  const pages = [];

  for (const entry of config) {
    const html = await fetchWikiHtml(entry.url);
    const articleHtml = extractArticleHtml(html);
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
        sourceType: "wiki-sync"
      }
    };

    await writeJson(path.join(PAGES_DIR, `${slug}.json`), page);

    categoriesMap.set(entry.category, {
      id: entry.category,
      label: entry.categoryLabel
    });

    pages.push({
      category: entry.category,
      slug,
      url: entry.url,
      title: entry.title,
      summary: page.summary,
      fetchedAt
    });
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
