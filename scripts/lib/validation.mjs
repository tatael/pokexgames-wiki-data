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

	let presentLocales = 0;
	for (const locale of [PT_BR, "en", "es"]) {
		const localizedValue = value[locale];
		if (localizedValue === undefined) continue;
		if (typeof localizedValue !== "string" || !localizedValue.trim()) {
			throw new Error(`${fieldName}.${locale} must be a non-empty string when present`);
		}

		assertNoMojibake(localizedValue, `${fieldName}.${locale}`);
		presentLocales += 1;
	}

	if (presentLocales === 0) throw new Error(`${fieldName} must contain at least one locale`);
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

function validateSection(section, fieldName) {
	if (!section || typeof section !== "object" || Array.isArray(section)) {
		throw new Error(`${fieldName} must be an object`);
	}

	if (typeof section.id !== "string" || !section.id.trim()) {
		throw new Error(`${fieldName}.id must be a non-empty string`);
	}

	if (typeof section.kind !== "string" || !section.kind.trim()) {
		throw new Error(`${fieldName}.kind must be a non-empty string`);
	}

	if (section.heading !== undefined || section.paragraphs !== undefined || section.items !== undefined) {
		throw new Error(`${fieldName} must use v2 title/content fields, not legacy heading/paragraphs/items`);
	}

	validateLocalizedMap(section.title, `${fieldName}.title`);
	if (section.content !== undefined) {
		for (const [locale, content] of Object.entries(section.content)) {
			if (!content || typeof content !== "object" || Array.isArray(content)) {
				throw new Error(`${fieldName}.content.${locale} must be an object`);
			}

			for (const key of ["paragraphs", "bullets"]) {
				if (content[key] === undefined) continue;
				if (!Array.isArray(content[key]) || content[key].some((item) => typeof item !== "string")) {
					throw new Error(`${fieldName}.content.${locale}.${key} must be a string array`);
				}
			}
		}
	}

	if (section.tables !== undefined) {
		for (const [locale, tables] of Object.entries(section.tables)) {
			if (!Array.isArray(tables)) throw new Error(`${fieldName}.tables.${locale} must be an array`);
			for (const [tableIndex, table] of tables.entries()) {
				if (!Array.isArray(table?.rows)) throw new Error(`${fieldName}.tables.${locale}.${tableIndex}.rows must be an array`);
				for (const [rowIndex, row] of table.rows.entries()) {
					if (!Array.isArray(row?.cells) || row.cells.length < 2) {
						throw new Error(`${fieldName}.tables.${locale}.${tableIndex}.rows.${rowIndex}.cells must contain at least two cells`);
					}

					for (const [cellIndex, cell] of row.cells.entries()) {
						if (!cell || typeof cell !== "object" || typeof cell.text !== "string") {
							throw new Error(`${fieldName}.tables.${locale}.${tableIndex}.rows.${rowIndex}.cells.${cellIndex}.text must be a string`);
						}
					}
				}
			}
		}
	}

	validateStructuredEntryMap(section.abilities, `${fieldName}.abilities`, ["name", "description"]);
	validateStructuredEntryMap(section.steps, `${fieldName}.steps`, ["index", "title", "body", "bullets", "rows"]);
	validateStructuredEntryMap(section.locations, `${fieldName}.locations`, ["description", "bullets", "rows"]);
	validateStructuredObjectMap(section.questPhases, `${fieldName}.questPhases`, ["body", "requirements", "objectives", "rewards", "npcs", "waits", "hints", "locations", "bullets", "rows", "maps"]);
	validateStructuredObjectMap(section.difficulties, `${fieldName}.difficulties`, ["intro", "entries", "notes"]);
	validateStructuredObjectMap(section.heldEnhancement, `${fieldName}.heldEnhancement`, ["intro", "entries", "notes"]);
	validateStructuredObjectMap(section.hazards, `${fieldName}.hazards`, ["description", "bullets"]);
	validateStructuredObjectMap(section.heldCategories, `${fieldName}.heldCategories`, ["groups"]);
	validateStructuredObjectMap(section.heldBoosts, `${fieldName}.heldBoosts`, ["ranges", "utilities"]);
	validateStructuredObjectMap(section.questSupport, `${fieldName}.questSupport`, ["intro", "bullets", "cards"]);
	validateStructuredObjectMap(section.clanTasks, `${fieldName}.clanTasks`, ["ranks"]);

	if (section.mediaRefs !== undefined) {
		for (const [locale, refs] of Object.entries(section.mediaRefs)) {
			if (!Array.isArray(refs) || refs.some((value) => typeof value !== "string" || !value.trim())) {
				throw new Error(`${fieldName}.mediaRefs.${locale} must be a non-empty string array`);
			}
		}
	}
}

function validateStructuredEntryMap(value, fieldName, allowedKeys) {
	if (value === undefined) return;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${fieldName} must be an object when present`);
	}

	for (const [locale, entries] of Object.entries(value)) {
		if (!Array.isArray(entries)) throw new Error(`${fieldName}.${locale} must be an array`);
		for (const [index, entry] of entries.entries()) {
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
				throw new Error(`${fieldName}.${locale}.${index} must be an object`);
			}

			for (const key of Object.keys(entry)) {
				if (!allowedKeys.includes(key)) throw new Error(`${fieldName}.${locale}.${index}.${key} is not supported`);
			}
		}
	}
}

function validateStructuredObjectMap(value, fieldName, allowedKeys) {
	if (value === undefined) return;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${fieldName} must be an object when present`);
	}

	for (const [locale, entry] of Object.entries(value)) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			throw new Error(`${fieldName}.${locale} must be an object`);
		}

		for (const key of Object.keys(entry)) {
			if (!allowedKeys.includes(key)) throw new Error(`${fieldName}.${locale}.${key} is not supported`);
		}
	}
}

export async function validateBundle(distDir = DIST_DIR) {
	const pagesDir = path.join(distDir, "pages");
	const manifestPath = path.join(distDir, "manifest.json");
	const manifest = await readJson(manifestPath);
	const mediaRegistry = manifest.mediaPath
		? await readJson(path.join(distDir, ...String(manifest.mediaPath).split("/")))
		: { entries: [] };
	const mediaIds = new Set((mediaRegistry?.entries ?? []).map((entry) => entry?.id).filter(Boolean));

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

		page.sections.forEach((section, index) => validateSection(section, `pages.${summary.slug}.sections.${index}`));
		for (const [sectionIndex, section] of (page.sections ?? []).entries()) {
			for (const refs of Object.values(section.mediaRefs ?? {})) {
				for (const ref of refs ?? []) {
					if (!mediaIds.has(ref)) {
						throw new Error(`pages.${summary.slug}.sections.${sectionIndex}.mediaRefs references unknown media id "${ref}"`);
					}
				}
			}
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

	if (manifest.mediaPath) {
		if (typeof manifest.mediaPath !== "string" || !manifest.mediaPath.endsWith(".json")) {
			throw new Error("manifest.mediaPath must be a json path when present");
		}

		if (!Array.isArray(mediaRegistry?.entries)) {
			throw new Error("media registry must contain an entries array");
		}

		for (const [index, entry] of mediaRegistry.entries.entries()) {
			if (typeof entry?.id !== "string" || !entry.id.trim()) throw new Error(`media registry entry ${index} must have an id`);
			if (typeof entry?.url !== "string" || !entry.url.startsWith("https://")) throw new Error(`media registry entry ${index} must have an https url`);
			if (typeof entry?.type !== "string" || !entry.type.trim()) throw new Error(`media registry entry ${index} must have a type`);
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
