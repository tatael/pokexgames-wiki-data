import path from "node:path";

import { DIST_DIR, PT_BR, readJson, writeJson } from "./lib/shared.mjs";

const OUTPUT_JSON_PATH = path.join(DIST_DIR, "coverage-report.json");
const OUTPUT_MD_PATH = path.join(DIST_DIR, "coverage-report.md");

const STRUCTURED_KEYS = [
	"facts",
	"tasks",
	"taskGroups",
	"pokemon",
	"rewards",
	"profile",
	"moves",
	"effectiveness",
	"variants",
	"abilities",
	"steps",
	"locations",
	"difficulties",
	"heldEnhancement",
	"hazards",
	"heldCategories",
	"heldBoosts",
	"heldDetails",
	"questSupport",
	"questPhases",
	"bossSupport",
	"bossRecommendations",
	"dungeonSupport",
	"embeddedTowerProgression",
	"embeddedTowerUnlocks",
	"embeddedTowerSupport",
	"linkedCards",
	"commerceEntries",
];

async function main() {
	const manifest = await readJson(path.join(DIST_DIR, "manifest.json"));
	const rows = [];
	for (const page of manifest.pages ?? []) {
		const pageFile = await readJson(path.join(DIST_DIR, "pages", ...String(page.pagePath ?? "").split("/")));
		for (const section of pageFile.sections ?? []) {
			const hasGenericContent = Boolean(section.content && Object.keys(section.content).length);
			const hasTables = Boolean(section.tables && Object.keys(section.tables).length);
			const typedKeys = STRUCTURED_KEYS.filter((key) => Boolean(section[key]));
			rows.push({
				category: page.category,
				slug: page.slug,
				title: page.title?.[PT_BR] ?? page.slug,
				pageKind: page.pageKind ?? "",
				sectionId: section.id,
				sectionTitle: section.title?.[PT_BR] ?? section.id,
				kind: section.kind ?? "prose",
				hasGenericContent,
				hasTables,
				typedKeys,
			});
		}
	}

	const byCategory = summarizeByCategory(rows);
	const report = {
		generatedAt: new Date().toISOString(),
		totalPages: new Set(rows.map((row) => row.slug)).size,
		totalSections: rows.length,
		categories: byCategory,
	};

	await writeJson(OUTPUT_JSON_PATH, report);
	await BunlessWriteMarkdown(report);
	console.log(`Coverage report written to ${OUTPUT_JSON_PATH}`);
	console.log(`Coverage report written to ${OUTPUT_MD_PATH}`);
}

function summarizeByCategory(rows) {
	const groups = new Map();
	for (const row of rows) {
		if (!groups.has(row.category)) groups.set(row.category, []);
		groups.get(row.category).push(row);
	}

	return [...groups.entries()]
		.map(([category, entries]) => {
			const typedOnly = entries.filter((entry) => entry.typedKeys.length && !entry.hasGenericContent && !entry.hasTables).length;
			const mixed = entries.filter((entry) => entry.typedKeys.length && (entry.hasGenericContent || entry.hasTables)).length;
			const genericOnly = entries.filter((entry) => !entry.typedKeys.length && (entry.hasGenericContent || entry.hasTables)).length;
			const empty = entries.filter((entry) => !entry.typedKeys.length && !entry.hasGenericContent && !entry.hasTables).length;
			const genericHeavyPages = summarizePages(entries);
			return {
				category,
				totalSections: entries.length,
				typedOnly,
				mixed,
				genericOnly,
				empty,
				typedRatio: toRatio(typedOnly + mixed, entries.length),
				genericRatio: toRatio(genericOnly + mixed, entries.length),
				pagesStillGenericHeavy: genericHeavyPages,
			};
		})
	sort((left, right) => right.genericRatio - left.genericRatio || right.totalSections - left.totalSections);
}

function summarizePages(entries) {
	const pageGroups = new Map();
	for (const entry of entries) {
		if (!pageGroups.has(entry.slug)) {
			pageGroups.set(entry.slug, {
				slug: entry.slug,
				title: entry.title,
				pageKind: entry.pageKind,
				totalSections: 0,
				genericSections: 0,
				typedSections: 0,
				mixedSections: 0,
				genericSectionIds: [],
			});
		}

		const summary = pageGroups.get(entry.slug);
		summary.totalSections += 1;
		if (entry.typedKeys.length) summary.typedSections += 1;
		if (entry.typedKeys.length && (entry.hasGenericContent || entry.hasTables)) summary.mixedSections += 1;
		if (!entry.typedKeys.length && (entry.hasGenericContent || entry.hasTables)) {
			summary.genericSections += 1;
			summary.genericSectionIds.push(entry.sectionId);
		}
	}

	return [...pageGroups.values()]
		.filter((page) => page.genericSections > 0)
		.map((page) => ({
			...page,
			genericRatio: toRatio(page.genericSections + page.mixedSections, page.totalSections),
		}))
		.sort((left, right) => right.genericRatio - left.genericRatio || right.genericSections - left.genericSections)
		.slice(0, 20);
}

function toRatio(value, total) {
	if (!total) return 0;
	return Number((value / total).toFixed(3));
}

async function BunlessWriteMarkdown(report) {
	const lines = [
		"# Coverage Report",
		"",
		`Generated: ${report.generatedAt}`,
		"",
		`Pages: ${report.totalPages}`,
		`Sections: ${report.totalSections}`,
		"",
		"| Category | Sections | Typed Only | Mixed | Generic Only | Typed Ratio | Generic Ratio |",
		"| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
	];

	for (const category of report.categories) {
		lines.push(`| ${category.category} | ${category.totalSections} | ${category.typedOnly} | ${category.mixed} | ${category.genericOnly} | ${category.typedRatio} | ${category.genericRatio} |`);
	}

	for (const category of report.categories) {
		lines.push("");
		lines.push(`## ${category.category}`);
		lines.push("");
		lines.push(`- sections: ${category.totalSections}`);
		lines.push(`- typed only: ${category.typedOnly}`);
		lines.push(`- mixed: ${category.mixed}`);
		lines.push(`- generic only: ${category.genericOnly}`);
		lines.push(`- typed ratio: ${category.typedRatio}`);
		lines.push(`- generic ratio: ${category.genericRatio}`);
		if (!category.pagesStillGenericHeavy.length) continue;
		lines.push("");
		lines.push("| Page | Kind | Generic Ratio | Generic Sections | Generic Section Ids |");
		lines.push("| --- | --- | ---: | ---: | --- |");
		for (const page of category.pagesStillGenericHeavy) {
			lines.push(`| ${page.title} | ${page.pageKind || "-"} | ${page.genericRatio} | ${page.genericSections} | ${page.genericSectionIds.join(", ")} |`);
		}
	}

	await writeFileCompat(OUTPUT_MD_PATH, `${lines.join("\n")}\n`);
}

async function writeFileCompat(filePath, value) {
	const { mkdir, writeFile } = await import("node:fs/promises");
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, value, "utf8");
}

await main();
