import fs from "node:fs";
import path from "node:path";

const PT_BR = "pt-BR";
const DIST_MANIFEST_PATH = path.join("dist", "manifest.json");
const DIST_MANIFEST_LABEL = "dist/manifest.json";
const OUTPUT_PATH = "WIKI_PAGE_REVIEW_CHECKLIST.md";

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

function buildChecklist(manifest) {
	const categories = manifest.categories ?? [];
	const pages = manifest.pages ?? [];
	const categoryLabels = new Map(categories.map((category) => [
		category.id,
		localized(category.label, category.id),
	]));

	const pagesByCategory = new Map(categories.map((category) => [category.id, []]));
	for (const page of pages) {
		if (!pagesByCategory.has(page.category)) pagesByCategory.set(page.category, []);
		pagesByCategory.get(page.category).push(page);
	}

	const lines = [
		"# Wiki Page Review Checklist",
		"",
		`Generated from \`${DIST_MANIFEST_LABEL}\` on ${new Date().toISOString()}.`,
		"",
		`Total pages: ${pages.length}. Categories: ${pagesByCategory.size}.`,
		"Use the checkbox for pages that look good in the overlay. Use the notes column for short tags like `render`, `upstream`, `image`, `text`, `ok-ish`, or a brief issue.",
		"",
		"Columns:",
		"- `OK`: manual review checkbox.",
		"- `Navigation`: full page path, including subpages/specializations.",
		"- `Kind`: published `pageKind`.",
		"- `List`: whether the page is intended to display in normal lists.",
		"- `Slug`: stable page id.",
		"- `Page file`: bundle JSON path.",
		"- `Notes`: manual review notes.",
		"",
	];

	const sortedCategories = [...pagesByCategory.entries()].sort((left, right) =>
		(categoryLabels.get(left[0]) || left[0]).localeCompare(
			categoryLabels.get(right[0]) || right[0],
			"pt-BR",
			{ sensitivity: "base" },
		)
	);

	for (const [categoryId, categoryPages] of sortedCategories) {
		const label = categoryLabels.get(categoryId) || categoryId;
		const sortedPages = categoryPages.slice().sort((left, right) => {
			const leftPath = navigationPath(left, label).join(" > ");
			const rightPath = navigationPath(right, label).join(" > ");
			return leftPath.localeCompare(rightPath, "pt-BR", { sensitivity: "base", numeric: true })
				|| left.slug.localeCompare(right.slug);
		});

		lines.push(`## ${label} (${categoryId})`);
		lines.push("");
		lines.push(`Pages: ${sortedPages.length}`);
		lines.push("");
		lines.push("| OK | Navigation | Kind | List | Slug | Page file | Notes |");
		lines.push("| --- | --- | --- | --- | --- | --- | --- |");
		for (const page of sortedPages) {
			const pathLabel = navigationPath(page, label).join(" > ");
			const listState = page.displayInList === false ? "hidden" : "listed";
			lines.push(`| [ ] | ${escapeTableCell(pathLabel)} | ${escapeTableCell(page.pageKind || "")} | ${listState} | \`${escapeTableCell(page.slug)}\` | \`${escapeTableCell(page.pagePath || "")}\` |  |`);
		}

		lines.push("");
	}

	return `${lines.join("\n")}\n`;
}

const manifest = JSON.parse(fs.readFileSync(DIST_MANIFEST_PATH, "utf8"));
fs.writeFileSync(OUTPUT_PATH, buildChecklist(manifest), "utf8");
console.log(`Wrote ${OUTPUT_PATH} with ${manifest.pages?.length ?? 0} pages.`);
