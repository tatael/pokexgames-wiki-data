import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const SCHEMA_VERSION = 1;
export const PT_BR = "pt-BR";
export const SOURCE_NAME = "PokeXGames Wiki";
export const ROOT_DIR = process.cwd();
export const CONFIG_PATH = path.join(ROOT_DIR, "config", "wiki-pages.json");
export const DIST_DIR = path.join(ROOT_DIR, "dist");
export const PAGES_DIR = path.join(DIST_DIR, "pages");
export const DISCOVERED_CONFIG_PATH = path.join(DIST_DIR, "discovered-pages.json");

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
	const asciiNormalized = value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/ß/g, "ss");
	const normalized = Array.from(asciiNormalized, (character) => {
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

export function extractArticleFragmentHtml(html, fragment) {
	if (!fragment) {
		return html;
	}

	const escapedFragment = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const headingRegex = /<h([2-4])[^>]*>[\s\S]*?<\/h\1>/gi;
	const headings = [];

	for (const match of html.matchAll(headingRegex)) {
		const fullMatch = match[0];
		const level = Number(match[1]);
		const start = match.index ?? -1;
		if (start < 0) {
			continue;
		}

		headings.push({
			start,
			end: start + fullMatch.length,
			level,
			html: fullMatch
		});
	}

	const currentHeadingIndex = headings.findIndex((heading) => new RegExp(`id=["']${escapedFragment}["']`, "i").test(heading.html));
	if (currentHeadingIndex < 0) {
		return html;
	}

	const currentHeading = headings[currentHeadingIndex];
	let end = html.length;

	for (let index = currentHeadingIndex + 1; index < headings.length; index += 1) {
		if (headings[index].level <= currentHeading.level) {
			end = headings[index].start;
			break;
		}
	}

	return html.slice(currentHeading.start, end);
}

export function decodeWikiTitleFromUrl(url) {
	const parsed = new URL(url);
	if (parsed.hostname !== "wiki.pokexgames.com" || !parsed.pathname.startsWith("/index.php/")) {
		return null;
	}

	const rawTitle = parsed.pathname.slice("/index.php/".length);
	if (!rawTitle) {
		return null;
	}

	return decodeURIComponent(rawTitle).replaceAll("_", " ");
}

export function buildWikiUrlFromTitle(title) {
	return `https://wiki.pokexgames.com/index.php/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

export function buildLocalizedText(baseValue) {
	return {
		[PT_BR]: baseValue,
		en: baseValue,
		es: baseValue
	};
}

export function extractArticleWikiLinks(html, pageUrl) {
	const baseUrl = new URL(pageUrl);
	const tokenRegex = /<h([2-4])[^>]*>([\s\S]*?)<\/h\1>|<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
	const results = [];
	const headingTrail = [];

	for (const match of html.matchAll(tokenRegex)) {
		if (match[1]) {
			const level = Number(match[1]);
			const headingLabel = stripHtml(match[2] ?? "");
			if (!headingLabel) {
				continue;
			}

			while (headingTrail.length && headingTrail[headingTrail.length - 1].level >= level) {
				headingTrail.pop();
			}

			headingTrail.push({ level, label: headingLabel });
			continue;
		}

		const href = match[3];
		const label = stripHtml(match[4] ?? "");
		if (!href) {
			continue;
		}

		let resolved;
		try {
			resolved = new URL(href, baseUrl);
		} catch {
			continue;
		}

		if (resolved.hostname !== "wiki.pokexgames.com" || !resolved.pathname.startsWith("/index.php/")) {
			continue;
		}

		if (resolved.pathname === baseUrl.pathname && resolved.hash) {
			continue;
		}

		if (resolved.searchParams.has("action") || resolved.searchParams.has("redlink")) {
			continue;
		}

		const title = decodeWikiTitleFromUrl(resolved.toString());
		if (!title) {
			continue;
		}

		if (title.includes(":") || title.includes("=")) {
			continue;
		}

		results.push({
			url: resolved.toString(),
			title,
			label: label || title,
			headingPath: headingTrail.map((item) => item.label)
		});
	}

	return results;
}

export function mergeNavigationPath(basePath, headingPath, leafLabel) {
	const merged = [];

	for (const part of [...basePath, ...headingPath, leafLabel]) {
		const normalized = typeof part === "string" ? part.trim() : "";
		if (!normalized) {
			continue;
		}

		if (isNoiseNavigationSegment(normalized)) {
			continue;
		}

		if (merged[merged.length - 1] !== normalized) {
			merged.push(normalized);
		}
	}

	return merged;
}

function isNoiseNavigationSegment(value) {
	const normalized = value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();

	return [
		"indice",
		"index",
		"introducao",
		"introduccion",
		"introduction",
		"primeros pasos",
		"primeiros passos",
		"first steps"
	].includes(normalized);
}

function isTranslatedVariantTitle(value) {
	return /\((ES|EN|PT-BR|PT|BR)\)\s*$/i.test(value.trim());
}

function looksLikeCraftPage(value) {
	return /\bcraft(s)?\b|craft\s+profiss/i.test(value);
}

function looksLikeWorkshopPage(value) {
	return /\bworkshop\b/i.test(value);
}

function looksLikeDungeonPage(value) {
	return /\bdungeons?\b/i.test(value);
}

function looksLikeMapPage(value) {
	return /\bmapa(s)?\b|\bmaps?\b/i.test(value);
}

function inferLeafFileSlug(entry) {
	const title = entry.title?.[PT_BR] || entry.slug;
	const pageKind = entry.pageKind || "";
	const combined = `${title} ${pageKind}`;

	if (looksLikeWorkshopPage(combined)) {
		return "workshop";
	}

	if (looksLikeCraftPage(combined)) {
		return "crafts";
	}

	if (looksLikeDungeonPage(combined)) {
		return "dungeons";
	}

	if (looksLikeMapPage(combined)) {
		return "maps";
	}

	const navigationPath = Array.isArray(entry.navigationPath) ? entry.navigationPath : [];
	const leafLabel = navigationPath[navigationPath.length - 1] || title;
	return buildSlug(leafLabel, entry.slug);
}

export function buildPagePath(entry) {
	const navigationPath = Array.isArray(entry.navigationPath) ? entry.navigationPath : [];
	const directories = [entry.category];

	for (const part of navigationPath.slice(1, -1)) {
		const slug = buildSlug(part, "");
		if (slug) {
			directories.push(slug);
		}
	}

	const fileName = `${inferLeafFileSlug(entry)}.json`;
	return [...directories, fileName].join("/");
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
	const maxLength = 180;

	for (const section of sections) {
		const paragraphs = section.paragraphs?.[PT_BR] ?? [];
		for (const paragraph of paragraphs) {
			if (!paragraph) {
				continue;
			}

			summary = summary ? `${summary} ${paragraph}` : paragraph;
			if (summary.length >= maxLength) {
				const truncated = summary.slice(0, maxLength);
				const lastSentenceEnd = Math.max(
					truncated.lastIndexOf(". "),
					truncated.lastIndexOf("! "),
					truncated.lastIndexOf("? ")
				);

				const lastSpace = truncated.lastIndexOf(" ");
				if (lastSentenceEnd > 0) {
					summary = truncated.slice(0, lastSentenceEnd + 1).trimEnd();
				} else {
					summary = (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trimEnd();
				}

				return { [PT_BR]: summary };
			}
		}
	}

	if (!summary) {
		summary = "Conteúdo local sincronizado da wiki.";
	}

	return { [PT_BR]: summary };
}

const _fetchCache = new Map();

export function fetchWikiHtml(url) {
	if (_fetchCache.has(url)) {
		return _fetchCache.get(url);
	}

	const promise = _fetchWikiHtml(url);
	_fetchCache.set(url, promise);
	return promise;
}

async function _fetchWikiHtml(url) {
	let lastError = null;

	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			const response = await fetch(url, {
				headers: {
					"User-Agent": "pokexgames-wiki-data/0.1 (+https://github.com/tatael/pokexgames-wiki-data)"
				},
				signal: AbortSignal.timeout(20000)
			});

			if (response.status === 404) {
				return null;
			}

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
		} catch (error) {
			lastError = error;
			if (attempt < 3) {
				await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error(`failed to fetch ${url}`);
}

export async function runWithConcurrency(items, limit, fn) {
	const results = new Array(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i], i);
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
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

		if (entry.navigationPath !== undefined) {
			if (!Array.isArray(entry.navigationPath) || entry.navigationPath.length === 0) {
				throw new Error(`config.${entry.slug}.navigationPath must be a non-empty array when present`);
			}

			for (const part of entry.navigationPath) {
				if (typeof part !== "string" || !part.trim()) {
					throw new Error(`config.${entry.slug}.navigationPath must contain only non-empty strings`);
				}
			}
		}

		if (entry.pageKind !== undefined && (typeof entry.pageKind !== "string" || !entry.pageKind.trim())) {
			throw new Error(`config.${entry.slug}.pageKind must be a non-empty string when present`);
		}

		if (entry.children !== undefined) {
			if (!entry.children || typeof entry.children !== "object" || Array.isArray(entry.children)) {
				throw new Error(`config.${entry.slug}.children must be an object when present`);
			}

			if (entry.children.mode !== "discover-links") {
				throw new Error(`config.${entry.slug}.children.mode must be "discover-links"`);
			}

			for (const field of ["excludeSlugs", "excludeTitles"]) {
				if (entry.children[field] !== undefined) {
					if (!Array.isArray(entry.children[field])) {
						throw new Error(`config.${entry.slug}.children.${field} must be an array when present`);
					}

					for (const item of entry.children[field]) {
						if (typeof item !== "string" || !item.trim()) {
							throw new Error(`config.${entry.slug}.children.${field} must contain only non-empty strings`);
						}
					}
				}
			}

			for (const field of ["pageKind", "titlePrefix"]) {
				if (entry.children[field] !== undefined && (typeof entry.children[field] !== "string" || !entry.children[field].trim())) {
					throw new Error(`config.${entry.slug}.children.${field} must be a non-empty string when present`);
				}
			}

			if (entry.children.maxDepth !== undefined) {
				if (!Number.isInteger(entry.children.maxDepth) || entry.children.maxDepth < 1) {
					throw new Error(`config.${entry.slug}.children.maxDepth must be an integer >= 1 when present`);
				}
			}
		}
	}
}

export async function cleanDist() {
	await rm(DIST_DIR, { recursive: true, force: true });
	await mkdir(PAGES_DIR, { recursive: true });
}

export async function loadConfig() {
	const config = await readJson(CONFIG_PATH);
	validateConfig(config);
	return expandConfigWithDiscoveredChildren(config);
}

export async function expandConfigWithDiscoveredChildren(config) {
	const expanded = [];
	// Pre-populate with all explicit config slugs so discovery never claims them
	const seenSlugs = new Set(config.map((entry) => entry.slug));
	const processedSlugs = new Set();
	const discoveredEntries = [];

	for (const entry of config) {
		if (processedSlugs.has(entry.slug)) {
			throw new Error(`duplicate config slug "${entry.slug}" after expansion`);
		}
		expanded.push(entry);
		processedSlugs.add(entry.slug);
	}

	const discoverEntries = config.filter((entry) => entry.children?.mode === "discover-links");
	await runWithConcurrency(discoverEntries, 6, (entry) =>
		discoverChildrenRecursive({
			parentEntry: entry,
			rootEntry: entry,
			childrenRule: entry.children,
			depth: 1,
			expanded,
			seenSlugs,
			discoveredEntries
		})
	);

	await writeJson(DISCOVERED_CONFIG_PATH, discoveredEntries);
	return expanded;
}

async function discoverChildrenRecursive({
	parentEntry,
	rootEntry,
	childrenRule,
	depth,
	expanded,
	seenSlugs,
	discoveredEntries
}) {
	const html = await fetchWikiHtml(parentEntry.url);
	if (!html) return;
	const articleHtml = extractArticleHtml(html);
	const links = extractArticleWikiLinks(articleHtml, parentEntry.url);
	const excludeSlugs = new Set(childrenRule.excludeSlugs || []);
	const excludeTitles = new Set(childrenRule.excludeTitles || []);

	for (const link of links) {
		const childSlug = buildSlug(link.title, "");
		if (
			!childSlug ||
			childSlug === parentEntry.slug ||
			childSlug === rootEntry.slug ||
			seenSlugs.has(childSlug) ||
			excludeSlugs.has(childSlug) ||
			excludeTitles.has(link.title) ||
			isTranslatedVariantTitle(link.title) ||
			isTranslatedVariantTitle(link.label)
		) {
			continue;
		}

		const titleValue = childrenRule.titlePrefix
			? `${childrenRule.titlePrefix}${link.label}`
			: link.label;
		const baseNavigationPath = parentEntry.navigationPath || [parentEntry.title?.[PT_BR] || parentEntry.slug];
		const inferredPageKind = inferDiscoveredPageKind(childrenRule.pageKind, link, titleValue);
		const childEntry = {
			category: rootEntry.category,
			categoryLabel: rootEntry.categoryLabel,
			slug: childSlug,
			url: link.url,
			title: buildLocalizedText(titleValue),
			navigationPath: mergeNavigationPath(baseNavigationPath, link.headingPath || [], link.label),
			pageKind: inferredPageKind
		};

		expanded.push(childEntry);
		discoveredEntries.push({
			parentSlug: rootEntry.slug,
			discoveredFromSlug: parentEntry.slug,
			slug: childSlug,
			url: link.url,
			title: childEntry.title,
			navigationPath: childEntry.navigationPath,
			pageKind: childEntry.pageKind,
			pagePath: buildPagePath(childEntry)
		});
		seenSlugs.add(childSlug);

		if (depth < (childrenRule.maxDepth || 1) && shouldRecurseDiscoveredPage(childEntry, depth)) {
			await discoverChildrenRecursive({
				parentEntry: childEntry,
				rootEntry,
				childrenRule,
				depth: depth + 1,
				expanded,
				seenSlugs,
				discoveredEntries
			});
		}
	}
}

function inferDiscoveredPageKind(defaultPageKind, link, titleValue) {
	const combined = `${titleValue} ${(link.headingPath || []).join(" ")}`;

	if (looksLikeWorkshopPage(combined)) {
		return "workshop";
	}

	if (looksLikeCraftPage(combined)) {
		return "craft";
	}

	if (looksLikeDungeonPage(combined)) {
		return "dungeons";
	}

	if (looksLikeMapPage(combined)) {
		return "map";
	}

	return defaultPageKind || "article";
}

function isLikelyRecursiveBranchNode(entry) {
	const title = entry.title?.[PT_BR] || "";
	const normalized = title
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim();

	if (!normalized || normalized.includes(":") || normalized.includes("/")) {
		return false;
	}

	const words = normalized.split(/\s+/).filter(Boolean);
	return words.length <= 2;
}

function shouldRecurseDiscoveredPage(entry, depth) {
	const pageKind = entry.pageKind || "";
	if (["workshop", "craft", "dungeons", "map", "artifact", "system"].includes(pageKind)) {
		return false;
	}

	if (isTranslatedVariantTitle(entry.title?.[PT_BR] || "")) {
		return false;
	}

	if (depth >= 2) {
		return isLikelyRecursiveBranchNode(entry);
	}

	return true;
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

		if (typeof summary.pagePath !== "string" || !summary.pagePath.trim() || !summary.pagePath.endsWith(".json")) {
			throw new Error(`manifest page "${summary.slug}" must include a non-empty pagePath ending in .json`);
		}

		validateLocalizedMap(summary.title, `manifest.pages.${summary.slug}.title`);
		validateLocalizedMap(summary.summary, `manifest.pages.${summary.slug}.summary`);
		assertRfc3339(summary.fetchedAt, `manifest.pages.${summary.slug}.fetchedAt`);

		const pagePath = path.join(PAGES_DIR, ...summary.pagePath.split("/"));
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
