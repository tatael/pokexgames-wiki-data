import {
	CONFIG_PATH,
	DISCOVERED_CONFIG_PATH,
	PT_BR,
	WIKI_DISCOVERY_CONCURRENCY,
	buildLocalizedText,
	buildPagePath,
	buildSlug,
	readJson,
	writeJson,
} from "./shared.mjs";
import { fetchWikiHtml, runWithConcurrency } from "./transport.mjs";
import {
	extractArticleHtml,
	extractArticleWikiLinks,
	mergeNavigationPath,
} from "./extract.mjs";

function validateLocalizedMap(value, fieldName) {
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

export function isTranslatedVariantTitle(value) {
	return /\((ES|EN|PT-BR|PT|BR)\)\s*$/i.test(value.trim());
}

const CONTENT_LIST_HEADING_TOKENS = [
	"indice",
	"index",
	"informacoes importantes",
	"informaciones importantes",
	"important information",
	"localizacao da rift",
	"rift location",
	"jardim de",
	"acessando o calabouco",
	"segunda etapa",
	"segredo",
	"boss alternativo",
];

export function isContentListHeading(value) {
	const normalized = value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

	return CONTENT_LIST_HEADING_TOKENS.some((token) => normalized.includes(token));
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

export function inferDiscoveredPageKind(defaultPageKind, link, titleValue) {
	const combined = `${titleValue} ${(link.headingPath || []).join(" ")}`;

	if (looksLikeWorkshopPage(combined)) return "workshop";
	if (looksLikeCraftPage(combined)) return "craft";
	if (looksLikeDungeonPage(combined)) return "dungeons";
	if (looksLikeMapPage(combined)) return "map";

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

export function shouldRecurseDiscoveredPage(entry, depth) {
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

export function shouldSkipDiscoveredLink({
	link,
	parentEntry,
	rootEntry,
	seenSlugs,
	excludeSlugs,
	excludeTitles,
}) {
	const childSlug = buildSlug(link.title, "");
	return (
		!childSlug
		|| childSlug === parentEntry.slug
		|| childSlug === rootEntry.slug
		|| seenSlugs.has(childSlug)
		|| excludeSlugs.has(childSlug)
		|| excludeTitles.has(link.title)
		|| isTranslatedVariantTitle(link.title)
		|| isTranslatedVariantTitle(link.label)
		|| (link.headingPath || []).some(isContentListHeading)
	);
}

async function discoverChildrenRecursive({
	parentEntry,
	rootEntry,
	childrenRule,
	depth,
	expanded,
	seenSlugs,
	discoveredEntries,
}) {
	const html = await fetchWikiHtml(parentEntry.url);
	if (!html) return;
	const articleHtml = extractArticleHtml(html);
	const links = extractArticleWikiLinks(articleHtml, parentEntry.url);
	const excludeSlugs = new Set(childrenRule.excludeSlugs || []);
	const excludeTitles = new Set(childrenRule.excludeTitles || []);

	for (const link of links) {
		const childSlug = buildSlug(link.title, "");
		if (shouldSkipDiscoveredLink({
			link,
			parentEntry,
			rootEntry,
			seenSlugs,
			excludeSlugs,
			excludeTitles,
		})) {
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
			pageKind: inferredPageKind,
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
			pagePath: buildPagePath(childEntry),
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
				discoveredEntries,
			});
		}
	}
}

export async function expandConfigWithDiscoveredChildren(config) {
	const expanded = [];
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
	await runWithConcurrency(discoverEntries, WIKI_DISCOVERY_CONCURRENCY, (entry) =>
		discoverChildrenRecursive({
			parentEntry: entry,
			rootEntry: entry,
			childrenRule: entry.children,
			depth: 1,
			expanded,
			seenSlugs,
			discoveredEntries,
		})
	);

	await writeJson(DISCOVERED_CONFIG_PATH, discoveredEntries);
	return expanded;
}

export async function loadConfig() {
	const config = await readJson(CONFIG_PATH);
	validateConfig(config);
	return expandConfigWithDiscoveredChildren(config);
}
