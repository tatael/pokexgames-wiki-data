import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const SCHEMA_VERSION = 1;
export const PT_BR = "pt-BR";
export const SOURCE_NAME = "PokeXGames Wiki";
export const ROOT_DIR = process.cwd();
export const CONFIG_PATH = path.join(ROOT_DIR, "config", "wiki-pages.json");
export const DIST_DIR = path.join(ROOT_DIR, "dist");
export const PAGES_DIR = path.join(DIST_DIR, "pages");

export async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function nowRfc3339() {
	return new Date().toISOString();
}

export function normalizeWhitespace(value) {
	return value.split(/\s+/).filter(Boolean).join(" ");
}

export function decodeHtmlEntities(value) {
	return value
		.replaceAll("&nbsp;", " ")
		.replaceAll("&amp;", "&")
		.replaceAll("&quot;", "\"")
		.replaceAll("&#39;", "'")
		.replaceAll("&apos;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&ccedil;", "c")
		.replaceAll("&Ccedil;", "C")
		.replaceAll("&atilde;", "a")
		.replaceAll("&Atilde;", "A")
		.replaceAll("&otilde;", "o")
		.replaceAll("&Otilde;", "O")
		.replaceAll("&aacute;", "a")
		.replaceAll("&Aacute;", "A")
		.replaceAll("&eacute;", "e")
		.replaceAll("&Eacute;", "E")
		.replaceAll("&iacute;", "i")
		.replaceAll("&Iacute;", "I")
		.replaceAll("&oacute;", "o")
		.replaceAll("&Oacute;", "O")
		.replaceAll("&uacute;", "u")
		.replaceAll("&Uacute;", "U")
		.replaceAll("&agrave;", "a")
		.replaceAll("&Agrave;", "A")
		.replaceAll("&ecirc;", "e")
		.replaceAll("&Ecirc;", "E")
		.replaceAll("&ocirc;", "o")
		.replaceAll("&Ocirc;", "O")
		.replaceAll("&ucirc;", "u")
		.replaceAll("&Ucirc;", "U")
		.replaceAll("&nbsp", " ")
		.replaceAll("&amp", "&")
		.replaceAll("&quot", "\"")
		.replaceAll("&#39", "'")
		.replaceAll("&apos", "'")
		.replaceAll("&lt", "<")
		.replaceAll("&gt", ">");
}

export function stripHtml(value) {
	const withoutTags = value.replace(/<[^>]+>/gs, " ");
	return normalizeWhitespace(decodeHtmlEntities(withoutTags.trim()));
}

export function buildSlug(value, fallback) {
	const normalized = Array.from(value, (character) => {
		if ((character >= "a" && character <= "z") || (character >= "0" && character <= "9")) {
			return character;
		}

		if (character >= "A" && character <= "Z") {
			return character.toLowerCase();
		}

		return "-";
	}).join("");

	const collapsed = normalized.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
	return collapsed || fallback;
}

export function extractTitle(html, fallbackTitle) {
	const match = html.match(/<title>(.*?)<\/title>/is);
	const title = match?.[1] ? stripHtml(match[1]) : "";
	return title || fallbackTitle;
}

export function extractArticleHtml(html) {
	const parserOutputMatch = html.match(/<div[^>]+class="[^"]*mw-parser-output[^"]*"[^>]*>([\s\S]*?)<div[^>]+class="printfooter"/i);
	if (parserOutputMatch?.[1]) {
		return parserOutputMatch[1];
	}

	const contentMatch = html.match(/<div[^>]+id="mw-content-text"[^>]*>([\s\S]*?)<div[^>]+id="catlinks"/i);
	if (contentMatch?.[1]) {
		return contentMatch[1];
	}

	return html;
}

export function extractLines(html) {
	const lines = [];
	const blockRegex = /<(p|li|h2|h3|h4)[^>]*>(.*?)<\/(p|li|h2|h3|h4)>/gis;

	for (const match of html.matchAll(blockRegex)) {
		const kind = match[1]?.toLowerCase();
		const body = stripHtml(match[2] ?? "");
		if (!kind || !body) {
			continue;
		}

		if (kind === "li") {
			lines.push(`* ${body}`);
			continue;
		}

		if (kind.startsWith("h")) {
			lines.push(`# ${body}`);
			continue;
		}

		lines.push(body);
	}

	if (lines.length === 0) {
		const fallback = stripHtml(html);
		if (fallback) {
			lines.push(fallback);
		}
	}

	return lines;
}

export function extractSections(html, title) {
	const headingRegex = /<h2[^>]*>(.*?)<\/h2>/gis;
	const headings = [];

	for (const match of html.matchAll(headingRegex)) {
		const fullMatch = match[0];
		const headingText = stripHtml(match[1] ?? "");
		const start = match.index ?? -1;
		if (start >= 0) {
			headings.push({
				start,
				end: start + fullMatch.length,
				heading: headingText
			});
		}
	}

	if (headings.length === 0) {
		const lines = extractLines(html);
		const paragraphs = lines.filter((line) => !line.startsWith("* "));
		const items = lines
			.filter((line) => line.startsWith("* "))
			.map((line) => line.slice(2));

		return [
			{
				id: buildSlug(title, "overview"),
				heading: { [PT_BR]: "Visão geral" },
				paragraphs: { [PT_BR]: paragraphs },
				items: { [PT_BR]: items }
			}
		];
	}

	return headings.map((entry, index) => {
		const nextStart = headings[index + 1]?.start ?? html.length;
		const slice = html.slice(entry.end, nextStart);
		const lines = extractLines(slice);
		const paragraphs = lines.filter((line) => !line.startsWith("* "));
		const items = lines
			.filter((line) => line.startsWith("* "))
			.map((line) => line.slice(2));

		return {
			id: buildSlug(entry.heading, `section-${index + 1}`),
			heading: { [PT_BR]: entry.heading },
			paragraphs: { [PT_BR]: paragraphs },
			items: { [PT_BR]: items }
		};
	});
}

export function buildSummary(sections) {
	let summary = "";

	for (const section of sections) {
		const paragraphs = section.paragraphs?.[PT_BR] ?? [];
		for (const paragraph of paragraphs) {
			if (!paragraph) {
				continue;
			}

			summary = summary ? `${summary} ${paragraph}` : paragraph;
			if (summary.length >= 180) {
				summary = summary.slice(0, 180).trimEnd();
				return { [PT_BR]: summary };
			}
		}
	}

	if (!summary) {
		summary = "Conteúdo local sincronizado da wiki.";
	}

	return { [PT_BR]: summary };
}

export async function fetchWikiHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "pokexgames-wiki-data/0.1 (+https://github.com/tatael/pokexgames-wiki-data)"
    }
  });

	if (!response.ok) {
		throw new Error(`failed to fetch ${url}: HTTP ${response.status}`);
	}

	const bytes = new Uint8Array(await response.arrayBuffer());
	const contentType = response.headers.get("content-type") || "";
	const headerCharsetMatch = contentType.match(/charset=([^;]+)/i);
	const headSnippet = new TextDecoder("utf-8").decode(bytes.slice(0, 2048));
	const metaCharsetMatch = headSnippet.match(/<meta[^>]+charset=["']?([^"'>\s]+)/i);
	const charset = (headerCharsetMatch?.[1] || metaCharsetMatch?.[1] || "utf-8").trim().toLowerCase();

	try {
		return new TextDecoder(charset).decode(bytes);
	} catch {
		return new TextDecoder("latin1").decode(bytes);
	}
}

export function validateLocalizedMap(value, fieldName) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${fieldName} must be an object`);
	}

	for (const locale of [PT_BR, "en", "es"]) {
		const localizedValue = value[locale];
		if (typeof localizedValue !== "string" || !localizedValue.trim()) {
			throw new Error(`${fieldName}.${locale} must be a non-empty string`);
		}
	}
}

export function assertRfc3339(value, fieldName) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
		throw new Error(`${fieldName} must be an RFC3339 UTC timestamp`);
	}
}

export function validateConfig(config) {
	if (!Array.isArray(config) || config.length === 0) {
		throw new Error("config/wiki-pages.json must contain at least one page entry");
	}

	const seenSlugs = new Set();
	for (const entry of config) {
		if (typeof entry.category !== "string" || !entry.category.trim()) {
			throw new Error("config entry category must be a non-empty string");
		}

		if (typeof entry.slug !== "string" || !entry.slug.trim()) {
			throw new Error("config entry slug must be a non-empty string");
		}

		if (buildSlug(entry.slug, "") !== entry.slug) {
			throw new Error(`config entry slug "${entry.slug}" must already be lowercase ASCII-safe`);
		}

		if (seenSlugs.has(entry.slug)) {
			throw new Error(`duplicate config slug "${entry.slug}"`);
		}

		seenSlugs.add(entry.slug);

		if (typeof entry.url !== "string" || !/^https:\/\/wiki\.pokexgames\.com\/index\.php\//.test(entry.url)) {
			throw new Error(`config entry "${entry.slug}" must use a wiki.pokexgames.com page URL`);
		}

		validateLocalizedMap(entry.categoryLabel, `config.${entry.slug}.categoryLabel`);
		validateLocalizedMap(entry.title, `config.${entry.slug}.title`);
	}
}

export async function cleanDist() {
	await rm(DIST_DIR, { recursive: true, force: true });
	await mkdir(PAGES_DIR, { recursive: true });
}

export async function loadConfig() {
	const config = await readJson(CONFIG_PATH);
	validateConfig(config);
	return config;
}

export async function validateBundle() {
	const manifestPath = path.join(DIST_DIR, "manifest.json");
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

		validateLocalizedMap(summary.title, `manifest.pages.${summary.slug}.title`);
		validateLocalizedMap(summary.summary, `manifest.pages.${summary.slug}.summary`);
		assertRfc3339(summary.fetchedAt, `manifest.pages.${summary.slug}.fetchedAt`);

		const pagePath = path.join(PAGES_DIR, `${summary.slug}.json`);
		let page;
		try {
			page = await readJson(pagePath);
		} catch (error) {
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

		validateLocalizedMap(page.title, `pages.${summary.slug}.title`);
		validateLocalizedMap(page.summary, `pages.${summary.slug}.summary`);
		assertRfc3339(page.fetchedAt, `pages.${summary.slug}.fetchedAt`);

		if (!Array.isArray(page.sections) || page.sections.length === 0) {
			throw new Error(`page file "${summary.slug}.json" must contain sections`);
		}

		for (const section of page.sections) {
			if (typeof section.id !== "string" || !section.id.trim()) {
				throw new Error(`page file "${summary.slug}.json" has a section without id`);
			}

			validateLocalizedMap(section.heading, `pages.${summary.slug}.sections.${section.id}.heading`);

			for (const field of ["paragraphs", "items"]) {
				const localized = section[field];
				if (!localized || typeof localized !== "object" || Array.isArray(localized)) {
					throw new Error(`pages.${summary.slug}.sections.${section.id}.${field} must be an object`);
				}

				for (const locale of [PT_BR, "en", "es"]) {
					if (!Array.isArray(localized[locale])) {
						throw new Error(`pages.${summary.slug}.sections.${section.id}.${field}.${locale} must be an array`);
					}
				}
			}
		}
	}

	const files = await readdir(PAGES_DIR);
	for (const fileName of files) {
		if (!fileName.endsWith(".json")) {
			continue;
		}

		const slug = fileName.slice(0, -5);
		if (!seenSlugs.has(slug)) {
			throw new Error(`dist/pages contains extra file "${fileName}" not listed in manifest`);
		}
	}
}

export async function distExists() {
	try {
		const result = await stat(DIST_DIR);
		return result.isDirectory();
	} catch {
		return false;
	}
}
