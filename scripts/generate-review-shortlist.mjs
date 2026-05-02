import fs from "node:fs";
import path from "node:path";

const PT_BR = "pt-BR";
const DIST_DIR = "dist";
const MANIFEST_PATH = path.join(DIST_DIR, "manifest.json");
const OUTPUT_PATH = "WIKI_PAGE_REVIEW_SHORTLIST.md";
const MAX_ROWS = Number(process.env.REVIEW_SHORTLIST_LIMIT || 350);

const TYPED_KEYS = [
	"abilities",
	"steps",
	"locations",
	"difficulties",
	"bossSupport",
	"bossRecommendations",
	"heldEnhancement",
	"hazards",
	"dungeonSupport",
	"heldCategories",
	"heldBoosts",
	"heldDetails",
	"questSupport",
	"questPhases",
	"clanTasks",
	"embeddedTowerProgression",
	"embeddedTowerUnlocks",
	"embeddedTowerSupport",
	"linkedCards",
	"commerceEntries",
	"craftEntries",
	"facts",
	"tasks",
	"taskGroups",
	"pokemon",
	"rewards",
	"profile",
	"moves",
	"effectiveness",
	"variants",
];

function localized(map, fallback = "") {
	if (!map || typeof map !== "object") return fallback;
	return map[PT_BR] || map.en || map.es || Object.values(map).find(Boolean) || fallback;
}

function toTitle(value) {
	return String(value || "")
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function navigationPath(page, categoryLabel) {
	if (Array.isArray(page.navigationPath) && page.navigationPath.length) return page.navigationPath;
	const metadataPath = page.metadata?.navigationPath;
	if (typeof metadataPath === "string" && metadataPath.trim()) {
		return metadataPath.split(/\s*>\s*/).filter(Boolean);
	}

	const pagePathSegments = String(page.pagePath || "")
		.replace(/\.json$/i, "")
		.split("/")
		.filter(Boolean);
	const title = localized(page.title, page.slug);
	if (pagePathSegments.length > 1) {
		return [categoryLabel, ...pagePathSegments.slice(1, -1).map(toTitle), title];
	}

	return [categoryLabel, title];
}

function escapeTableCell(value) {
	return String(value ?? "")
		.replace(/\|/g, "\\|")
		.replace(/\r?\n/g, " ")
		.trim();
}

function sectionContentText(section) {
	const chunks = [];
	for (const value of Object.values(section.content ?? {})) {
		chunks.push(...(value?.paragraphs ?? []), ...(value?.bullets ?? []));
	}
	for (const tables of Object.values(section.tables ?? {})) {
		for (const table of tables ?? []) {
			for (const row of table?.rows ?? []) {
				chunks.push(...(row?.cells ?? []).map((cell) => cell?.text ?? cell?.raw ?? ""));
			}
		}
	}
	return chunks.join(" ");
}

function stripInlineImageSyntax(value) {
	return String(value ?? "")
		.replace(/\b[\w%()' -]+\.(?:png|gif|webp|jpe?g|svg)\b/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function hasMojibake(value) {
	return /(?:Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|â€|â€™|â€œ|â€|�)/.test(String(value ?? ""));
}

function scorePage(summary, page) {
	const listed = summary.displayInList !== false;
	const sections = page.sections ?? [];
	const typedSections = sections.filter((section) => TYPED_KEYS.some((key) => section[key] !== undefined)).length;
	const genericOnlySections = sections.filter((section) => {
		const hasTyped = TYPED_KEYS.some((key) => section[key] !== undefined);
		const hasGeneric = Boolean(section.content || section.tables);
		return hasGeneric && !hasTyped;
	}).length;
	const text = [
		JSON.stringify(summary.title ?? {}),
		JSON.stringify(summary.summary ?? {}),
		...sections.map(sectionContentText),
	].join(" ");
	const displayText = stripInlineImageSyntax(text);
	const rawFilenameCount = (displayText.match(/\b[\w%()' -]+\.(?:png|gif|webp|jpe?g|svg)\b/gi) ?? []).length;
	const longParagraphCount = sections.flatMap((section) =>
		Object.values(section.content ?? {}).flatMap((content) => content?.paragraphs ?? [])
	).filter((paragraph) => String(paragraph ?? "").length > 900).length;
	const mediaOnlySections = sections.filter((section) =>
		!section.content
		&& !section.tables
		&& !TYPED_KEYS.some((key) => section[key] !== undefined)
		&& section.mediaRefs
	).length;
	const hiddenContentPage = !listed && sections.length >= 2 && summary.pageKind !== "index";
	const importantKind = /craft|workshop|quest|boss|dungeons|calculator|planner|system|specialization|item|npc/i.test(summary.pageKind ?? "");

	const reasons = [];
	let score = 0;
	if (listed) { score += 35; reasons.push("listed"); }
	if (importantKind) { score += 12; reasons.push(`kind:${summary.pageKind}`); }
	if (genericOnlySections) { score += Math.min(30, genericOnlySections * 6); reasons.push(`generic:${genericOnlySections}`); }
	if (typedSections === 0) { score += 12; reasons.push("no-typed"); }
	if (rawFilenameCount) { score += Math.min(18, rawFilenameCount * 2); reasons.push(`raw-files:${rawFilenameCount}`); }
	if (longParagraphCount) { score += Math.min(18, longParagraphCount * 6); reasons.push(`long-text:${longParagraphCount}`); }
	if (mediaOnlySections) { score += Math.min(12, mediaOnlySections * 4); reasons.push(`media-only:${mediaOnlySections}`); }
	if (hasMojibake(text)) { score += 20; reasons.push("mojibake"); }
	if (hiddenContentPage) { score += 8; reasons.push("hidden-content"); }
	if (sections.length <= 1 && summary.pageKind !== "pokemon") { score += 4; reasons.push("small-page"); }

	return {
		score,
		reasons,
		typedSections,
		genericOnlySections,
		rawFilenameCount,
		longParagraphCount,
	};
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const categoryLabels = new Map((manifest.categories ?? []).map((category) => [
	category.id,
	localized(category.label, category.id),
]));
const rows = [];
const categoryStats = new Map();

for (const summary of manifest.pages ?? []) {
	const pagePath = path.join(DIST_DIR, "pages", ...String(summary.pagePath ?? "").split("/"));
	let page = null;
	try {
		page = JSON.parse(fs.readFileSync(pagePath, "utf8"));
	} catch {
		page = { sections: [] };
	}
	const categoryLabel = categoryLabels.get(summary.category) || summary.category;
	const scored = scorePage(summary, page);
	rows.push({
		...summary,
		...scored,
		navigation: navigationPath(summary, categoryLabel).join(" > "),
		categoryLabel,
	});
	const stat = categoryStats.get(summary.category) ?? { label: categoryLabel, total: 0, listed: 0, flagged: 0 };
	stat.total += 1;
	if (summary.displayInList !== false) stat.listed += 1;
	if (scored.score >= 45) stat.flagged += 1;
	categoryStats.set(summary.category, stat);
}

const sortedRows = rows
	.filter((row) => row.score >= 35)
	.sort((left, right) => right.score - left.score || left.navigation.localeCompare(right.navigation, "pt-BR", { sensitivity: "base", numeric: true }))
	.slice(0, MAX_ROWS);

const lines = [
	"# Wiki Page Review Shortlist",
	"",
	`Generated from \`dist/manifest.json\` on ${new Date().toISOString()}.`,
	"",
	`This is a prioritized review list. It does not replace \`WIKI_PAGE_REVIEW_CHECKLIST.md\`; it tells you where to start.`,
	"",
	`Rows shown: ${sortedRows.length}. Limit: ${MAX_ROWS}. Source pages: ${manifest.pages?.length ?? 0}.`,
	"",
	"Suggested workflow:",
	"1. Review rows from top to bottom until the score drops below what feels useful.",
	"2. Mark `OK` only after checking the page in the overlay.",
	"3. Put short notes in `Notes`: `render`, `upstream`, `image`, `text`, `missing`, `duplicate`, or `low-priority`.",
	"4. Send back a batch of unchecked rows with notes for fixes.",
	"",
	"Score reasons are heuristic: `listed`, `generic`, `no-typed`, `raw-files`, `long-text`, `media-only`, `mojibake`, `hidden-content`, and important `kind:*`.",
	"",
	"## Category Summary",
	"",
	"| Category | Total | Listed | Flagged |",
	"| --- | ---: | ---: | ---: |",
];

for (const stat of [...categoryStats.values()].sort((left, right) => right.flagged - left.flagged || left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" }))) {
	lines.push(`| ${escapeTableCell(stat.label)} | ${stat.total} | ${stat.listed} | ${stat.flagged} |`);
}

lines.push("");
lines.push("## Prioritized Pages");
lines.push("");
lines.push("| OK | Score | Navigation | Kind | List | Slug | Reasons | Notes |");
lines.push("| --- | ---: | --- | --- | --- | --- | --- | --- |");

for (const row of sortedRows) {
	const listState = row.displayInList === false ? "hidden" : "listed";
	lines.push(`| [ ] | ${row.score} | ${escapeTableCell(row.navigation)} | ${escapeTableCell(row.pageKind || "")} | ${listState} | \`${escapeTableCell(row.slug)}\` | ${escapeTableCell(row.reasons.join(", "))} |  |`);
}

fs.writeFileSync(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${OUTPUT_PATH} with ${sortedRows.length} prioritized pages.`);
