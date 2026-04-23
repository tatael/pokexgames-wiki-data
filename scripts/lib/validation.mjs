import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
	DIST_DIR,
	PT_BR,
	SCHEMA_VERSION,
	SOURCE_NAME,
	buildSlug,
	readJson,
} from "./shared.mjs";

function assertNoMojibake(value, fieldName) {
	if (typeof value !== "string") return;
	if (/[\u00C3\u00C2]/.test(value) || value.includes("\u00E2\u20AC\u201D") || value.includes("\u00E2\u20AC\u201C")) {
		throw new Error(`${fieldName} contains broken text encoding`);
	}
}

function validateLocalizedMap(value, fieldName) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${fieldName} must be an object`);
	}

	for (const locale of [PT_BR, "en", "es"]) {
		const localizedValue = value[locale];
		if (typeof localizedValue !== "string" || !localizedValue.trim()) {
			throw new Error(`${fieldName}.${locale} must be a non-empty string`);
		}

		assertNoMojibake(localizedValue, `${fieldName}.${locale}`);
	}
}

function assertRfc3339(value, fieldName) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
		throw new Error(`${fieldName} must be an RFC3339 UTC timestamp`);
	}
}

function validateImageSet(value, fieldName) {
	if (value === undefined) return;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${fieldName} must be an object when present`);
	}

	for (const kind of ["sprite", "hero"]) {
		if (value[kind] === undefined) continue;
		if (!value[kind] || typeof value[kind] !== "object" || Array.isArray(value[kind])) {
			throw new Error(`${fieldName}.${kind} must be an object when present`);
		}

		if (typeof value[kind].url !== "string" || !value[kind].url.startsWith("https://")) {
			throw new Error(`${fieldName}.${kind}.url must be an https url`);
		}
	}
}

export async function validateBundle(distDir = DIST_DIR) {
	const pagesDir = path.join(distDir, "pages");
	const manifestPath = path.join(distDir, "manifest.json");
	const manifest = await readJson(manifestPath);

	if (manifest.schemaVersion !== SCHEMA_VERSION) {
		throw new Error(`manifest schemaVersion must be ${SCHEMA_VERSION}`);
	}

	if (manifest.source !== SOURCE_NAME) {
		throw new Error(`manifest source must be "${SOURCE_NAME}"`);
	}

	assertRfc3339(manifest.updatedAt, "manifest.updatedAt");

	if (!Array.isArray(manifest.categories) || manifest.categories.length === 0) {
		throw new Error("manifest.categories must contain at least one category");
	}

	if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
		throw new Error("manifest.pages must contain at least one page");
	}

	const categoryIds = new Set();
	for (const category of manifest.categories) {
		if (typeof category.id !== "string" || !category.id.trim()) {
			throw new Error("manifest category id must be a non-empty string");
		}

		validateLocalizedMap(category.label, `manifest.categories.${category.id}.label`);
		categoryIds.add(category.id);
	}

	const seenSlugs = new Set();
	for (const summary of manifest.pages) {
		if (!categoryIds.has(summary.category)) {
			throw new Error(`manifest page "${summary.slug}" references unknown category "${summary.category}"`);
		}

		if (typeof summary.slug !== "string" || buildSlug(summary.slug, "") !== summary.slug) {
			throw new Error(`manifest page slug "${summary.slug}" is invalid`);
		}

		if (seenSlugs.has(summary.slug)) {
			throw new Error(`duplicate manifest page slug "${summary.slug}"`);
		}

		seenSlugs.add(summary.slug);

		if (typeof summary.url !== "string" || !summary.url.startsWith("https://")) {
			throw new Error(`manifest page "${summary.slug}" must include an https url`);
		}

		if (typeof summary.pagePath !== "string" || !summary.pagePath.trim() || !summary.pagePath.endsWith(".json")) {
			throw new Error(`manifest page "${summary.slug}" must include a non-empty pagePath ending in .json`);
		}

		if (typeof summary.pageKind !== "string" || !summary.pageKind.trim()) {
			throw new Error(`manifest page "${summary.slug}" must include a non-empty pageKind`);
		}

		validateLocalizedMap(summary.title, `manifest.pages.${summary.slug}.title`);
		validateLocalizedMap(summary.summary, `manifest.pages.${summary.slug}.summary`);
		if (summary.pageGroup !== undefined) validateLocalizedMap(summary.pageGroup, `manifest.pages.${summary.slug}.pageGroup`);
		if (summary.displayInList !== undefined && typeof summary.displayInList !== "boolean") {
			throw new Error(`manifest page "${summary.slug}".displayInList must be a boolean when present`);
		}
		validateImageSet(summary.images, `manifest.pages.${summary.slug}.images`);
		assertRfc3339(summary.fetchedAt, `manifest.pages.${summary.slug}.fetchedAt`);

		const pagePath = path.join(pagesDir, ...summary.pagePath.split("/"));
		let page;
		try {
			page = await readJson(pagePath);
		} catch {
			throw new Error(`missing page file for slug "${summary.slug}"`);
		}

		if (page.slug !== summary.slug) {
			throw new Error(`page file "${summary.slug}.json" has mismatched slug`);
		}

		if (page.category !== summary.category) {
			throw new Error(`page file "${summary.slug}.json" has mismatched category`);
		}

		if (page.url !== summary.url) {
			throw new Error(`page file "${summary.slug}.json" has mismatched url`);
		}

		if (page.source !== SOURCE_NAME) {
			throw new Error(`page file "${summary.slug}.json" has unexpected source`);
		}

		if (page.pageKind !== summary.pageKind) {
			throw new Error(`page file "${summary.slug}.json" has mismatched pageKind`);
		}

		validateLocalizedMap(page.title, `pages.${summary.slug}.title`);
		validateLocalizedMap(page.summary, `pages.${summary.slug}.summary`);
		if (page.pageGroup !== undefined) validateLocalizedMap(page.pageGroup, `pages.${summary.slug}.pageGroup`);
		if (page.displayInList !== summary.displayInList) {
			throw new Error(`page file "${summary.slug}.json" has mismatched displayInList`);
		}

		if (JSON.stringify(page.pageGroup ?? null) !== JSON.stringify(summary.pageGroup ?? null)) {
			throw new Error(`page file "${summary.slug}.json" has mismatched pageGroup`);
		}
		validateImageSet(page.images, `pages.${summary.slug}.images`);
		assertRfc3339(page.fetchedAt, `pages.${summary.slug}.fetchedAt`);

		if (JSON.stringify(page.images ?? null) !== JSON.stringify(summary.images ?? null)) {
			throw new Error(`page file "${summary.slug}.json" has mismatched images`);
		}

		if (!Array.isArray(page.sections) || page.sections.length === 0) {
			throw new Error(`page "${summary.slug}" must contain at least one section`);
		}

		if (summary.pageKind === "pokemon" && (!page.profile || typeof page.profile !== "object")) {
			throw new Error(`pokemon page "${summary.slug}" must contain a profile`);
		}
	}

	const pageDirectories = await readdir(pagesDir, { recursive: true });
	for (const relativePath of pageDirectories) {
		const fileName = relativePath.toString();
		if (!fileName.endsWith(".json")) continue;
		const slug = path.basename(fileName, ".json");
		if (!seenSlugs.has(slug)) {
			throw new Error(`dist/pages contains extra file "${fileName}" not listed in manifest`);
		}
	}
}

export async function distExists(distDir = DIST_DIR) {
	try {
		const result = await stat(distDir);
		return result.isDirectory();
	} catch {
		return false;
	}
}
