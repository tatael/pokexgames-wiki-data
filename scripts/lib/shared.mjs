import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const SCHEMA_VERSION = 1;
export const PT_BR = "pt-BR";
export const SOURCE_NAME = "PokeXGames Wiki";
export const ROOT_DIR = process.cwd();
export const CONFIG_PATH = path.join(ROOT_DIR, "config", "wiki-pages.json");
export const POKEMON_DISCOVERY_CACHE_PATH = path.join(ROOT_DIR, ".cache", "pokemon-pages.generated.json");
export const DIST_DIR = path.join(ROOT_DIR, "dist");
export const DIST_BUILD_DIR = path.join(ROOT_DIR, "dist.build");
export const DIST_PREVIOUS_DIR = path.join(ROOT_DIR, "dist.prev");
export const PAGES_DIR = path.join(DIST_DIR, "pages");
export const PAGES_BUILD_DIR = path.join(DIST_BUILD_DIR, "pages");
export const DISCOVERED_CONFIG_PATH = path.join(DIST_DIR, "discovered-pages.json");

function readPositiveIntEnv(name, fallback) {
	const raw = process.env[name];
	const parsed = Number.parseInt(raw ?? "", 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolEnv(name, fallback = false) {
	const raw = process.env[name];
	if (raw == null || raw === "") return fallback;
	return /^(1|true|yes|on)$/i.test(raw);
}

export const WIKI_FETCH_TIMEOUT_MS = readPositiveIntEnv("WIKI_FETCH_TIMEOUT_MS", 60000);
export const WIKI_FETCH_RETRY_ATTEMPTS = readPositiveIntEnv("WIKI_FETCH_RETRY_ATTEMPTS", 3);
export const WIKI_DISCOVERY_CONCURRENCY = readPositiveIntEnv("WIKI_DISCOVERY_CONCURRENCY", 48);
export const WIKI_SYNC_CONCURRENCY = readPositiveIntEnv("WIKI_SYNC_CONCURRENCY", 24);
export const WIKI_DISCOVERY_CACHE_HOURS = readPositiveIntEnv("WIKI_DISCOVERY_CACHE_HOURS", 168);
export const WIKI_DISCOVERY_FORCE = readBoolEnv("WIKI_DISCOVERY_FORCE", false);

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
	const namedEntities = {
		nbsp: " ",
		amp: "&",
		quot: "\"",
		apos: "'",
		lt: "<",
		gt: ">",
		ccedil: "ç",
		Ccedil: "Ç",
		atilde: "ã",
		Atilde: "Ã",
		otilde: "õ",
		Otilde: "Õ",
		aacute: "á",
		Aacute: "Á",
		eacute: "é",
		Eacute: "É",
		iacute: "í",
		Iacute: "Í",
		oacute: "ó",
		Oacute: "Ó",
		uacute: "ú",
		Uacute: "Ú",
		agrave: "à",
		Agrave: "À",
		egrave: "è",
		Egrave: "È",
		ograve: "ò",
		Ograve: "Ò",
		ecirc: "ê",
		Ecirc: "Ê",
		ocirc: "ô",
		Ocirc: "Ô",
		ucirc: "û",
		Ucirc: "Û",
		acirc: "â",
		Acirc: "Â",
		uuml: "ü",
		Uuml: "Ü",
		ntilde: "ñ",
		Ntilde: "Ñ",
	};

	return String(value ?? "")
		.replace(/&#(\d+);?/g, (_match, code) => {
			const parsed = Number.parseInt(code, 10);
			return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : _match;
		})
		.replace(/&#x([0-9a-f]+);?/gi, (_match, code) => {
			const parsed = Number.parseInt(code, 16);
			return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : _match;
		})
		.replace(/&([a-zA-Z][a-zA-Z0-9]+);?/g, (match, entity) => namedEntities[entity] ?? match)
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
	const withoutScripts = String(value ?? "")
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
	const withoutTags = withoutScripts.replace(/<[^>]+>/gs, " ");
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

export function buildLocalizedText(baseValue) {
	return {
		[PT_BR]: baseValue,
		en: baseValue,
		es: baseValue
	};
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
	const preferSemanticSlug = (semanticSlug) => semanticSlug === entry.slug ? semanticSlug : entry.slug;

	if (looksLikeWorkshopPage(combined)) {
		return preferSemanticSlug("workshop");
	}

	if (looksLikeCraftPage(combined)) {
		return preferSemanticSlug("crafts");
	}

	if (looksLikeDungeonPage(combined)) {
		return preferSemanticSlug("dungeons");
	}

	if (looksLikeMapPage(combined)) {
		return preferSemanticSlug("maps");
	}

	const navigationPath = Array.isArray(entry.navigationPath) ? entry.navigationPath : [];
	const leafLabel = navigationPath[navigationPath.length - 1] || title;
	const inferredSlug = buildSlug(leafLabel, entry.slug);
	return inferredSlug === entry.slug ? inferredSlug : entry.slug;
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
