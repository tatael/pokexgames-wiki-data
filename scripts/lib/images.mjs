import { fetchWikiApiJson } from "./transport.mjs";
import { isNoiseMediaAsset } from "./extract.mjs";

const VARIANT_MARKERS = [
	"shiny",
	"mega",
	"alolan",
	"galarian",
	"hisuian",
	"paldean",
	"bloodmoon",
	"champion",
	"primal",
	"shadow",
	"armored",
	"origin",
	"therian",
	"attack",
	"defense",
	"speed",
	"female",
	"male",
	"golden",
	"ssh",
];

function normalizeImageKey(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]/g, "")
		.toLowerCase();
}

function variantMarkersFor(value) {
	const normalized = normalizeImageKey(value);
	const markers = new Set();

	for (const marker of VARIANT_MARKERS) {
		if (normalized.includes(marker)) {
			markers.add(marker === "ssh" ? "shiny" : marker);
		}
	}

	if (normalized.startsWith("ssh") || normalized.startsWith("shiny")) {
		markers.add("shiny");
	}

	return markers;
}

function stripVariantMarkers(value) {
	let normalized = normalizeImageKey(value);
	while (/^\d/.test(normalized)) {
		normalized = normalized.slice(1);
	}

	for (const marker of VARIANT_MARKERS) {
		normalized = normalized.replaceAll(marker, "");
	}

	return normalized;
}

function stripFormNumbers(value) {
	return normalizeImageKey(value).replace(/\d+/g, "");
}

function imageMatchTokens(value) {
	const trimmed = String(value ?? "").trim().toLowerCase();
	if (!trimmed) return [];

	const tokens = [];
	for (const token of trimmed.split(/[^a-z0-9]+/i)) {
		const normalized = normalizeImageKey(token);
		if (normalized.length >= 4 && !tokens.includes(normalized)) {
			tokens.push(normalized);
		}
	}

	const collapsed = normalizeImageKey(trimmed);
	if (collapsed.length >= 4 && !tokens.includes(collapsed)) {
		tokens.push(collapsed);
	}

	return tokens;
}

function pokemonMatchKeys(slug) {
	return imageMatchTokens(slug);
}

function fileStemFromUrl(url) {
	const withoutQuery = String(url ?? "").split(/[?#]/, 1)[0];
	const filename = withoutQuery.split("/").pop() ?? withoutQuery;
	const stem = filename.replace(/\.[^.]+$/, "");
	return normalizeImageKey(stem);
}

function stripFormatSuffix(core) {
	// Strip embedded format names, site tags, game version suffixes, and trailing version numbers
	// e.g. "AlolanRaichuGif" → "alolanraichu", "ShinyGrimerpxg" → "shinygrimer",
	//      "MSalamenceORAS" → "msalamence", "ShinyAriados2" → "shinyariados"
	return core
		.replace(/(?:gif|png|jpg|jpeg|webp|svg|pxg|oras|xy|bw|dp|hgss|sm|usum|swsh|bdsp)$/, '')
		.replace(/\d+$/, '')
		|| core;
}

function normalizeStemForIdentity(stem, expectedMarkers) {
	const stemMarkers = new Set(variantMarkersFor(stem));
	let stemCore = stripFormatSuffix(stripVariantMarkers(stem));

	// "Shi" prefix as "Shiny" abbreviation (e.g. "ShiJynx" for shiny-jynx)
	if (expectedMarkers.has('shiny') && !stemMarkers.has('shiny') && stem.startsWith('shi')) {
		stemMarkers.add('shiny');
		stemCore = stripFormatSuffix(stripVariantMarkers(stem.slice(3)));
	}

	// "M" prefix as "Mega" abbreviation (e.g. "MSalamence" for mega-salamence)
	if (expectedMarkers.has('mega') && !stemMarkers.has('mega') && stem.startsWith('m')) {
		stemMarkers.add('mega');
		stemCore = stripFormatSuffix(stripVariantMarkers(stem.slice(1)));
	}

	return { stemCore, stemMarkers };
}

function matchesFormIdentity(stem, slug) {
	const expectedMarkers = variantMarkersFor(slug);
	const expectedCore = stripVariantMarkers(slug);
	const { stemCore, stemMarkers } = normalizeStemForIdentity(stem, expectedMarkers);

	const sameCore = expectedCore === stemCore
		|| (/\d/.test(expectedCore) && stripFormNumbers(expectedCore) === stripFormNumbers(stemCore));

	return Boolean(expectedCore) && sameCore && expectedMarkers.size === stemMarkers.size
		&& [...expectedMarkers].every((marker) => stemMarkers.has(marker));
}

function isGenericSpriteAsset(url) {
	const stem = fileStemFromUrl(url);
	return [
		"normal",
		"normal1",
		"flying",
		"fire",
		"water",
		"grass",
		"electric",
		"ice",
		"fighting",
		"poison",
		"ground",
		"psychic",
		"bug",
		"rock",
		"ghost",
		"dragon",
		"dark",
		"steel",
		"fairy",
		"focusblocked",
		"target",
		"self",
		"damage",
		"slow",
		"buff",
		"debuff",
		"aoe",
		"passive",
		"blocked",
		"healing",
		"paralyze",
	].includes(stem);
}

function matchesExpectedExtension(url, kind) {
	const lower = String(url ?? "").split(/[?#]/, 1)[0].toLowerCase();
	if (kind === "hero") return lower.endsWith(".gif");
	return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".svg");
}

function replaceImageExtension(url, extension) {
	const trimmed = String(url ?? "").trim();
	if (!trimmed) return null;
	const [base, suffix = ""] = trimmed.split(/([?#].*)/, 2);
	const index = base.lastIndexOf(".");
	if (index === -1) return null;
	return `${base.slice(0, index)}.${extension}${suffix}`;
}

function buildKindCandidateUrls(urls, kind) {
	const candidates = [];
	const fallbackCandidates = [];
	for (const url of urls) {
		if (kind === "sprite" && isGenericSpriteAsset(url)) continue;

		if (matchesExpectedExtension(url, kind)) {
			if (!candidates.includes(url)) candidates.push(url);
			continue;
		}

		if (kind === "sprite" && /\.gif(?:[?#]|$)/i.test(url)) {
			if (!fallbackCandidates.includes(url)) fallbackCandidates.push(url);
		}
	}

	return kind === "sprite" ? [...candidates, ...fallbackCandidates] : candidates;
}

function absolutizeWikiImageUrl(pageUrl, rawSrc) {
	const source = String(rawSrc ?? "").trim();
	if (!source) return null;
	if (/^https?:\/\//i.test(source)) return source;
	if (source.startsWith("//")) return `https:${source}`;
	if (source.startsWith("/")) return `https://wiki.pokexgames.com${source}`;
	const prefix = String(pageUrl ?? "").split("/").slice(0, -1).join("/");
	return `${prefix}/${source}`;
}

function firstImageCandidatesFromTag(tag, pageUrl) {
	const values = [];
	const push = (raw) => {
		const abs = absolutizeWikiImageUrl(pageUrl, raw);
		if (!abs || !abs.includes("/images/") || values.includes(abs)) return;
		values.push(abs);
		const original = extractThumbnailOriginalUrl(abs);
		if (original && !values.includes(original)) values.push(original);
	};

	push(tag.match(/\bsrc="([^"]+)"/i)?.[1]);
	push(tag.match(/\bdata-src="([^"]+)"/i)?.[1]);
	return values;
}

function extractThumbnailOriginalUrl(absoluteUrl) {
	// MediaWiki thumbnails: /images/thumb/x/xx/File.ext/200px-File.ext
	// → recover original:   /images/x/xx/File.ext
	const m = absoluteUrl.match(/^(https?:\/\/[^/]+)\/images\/thumb\/([a-f0-9]+\/[a-f0-9]+\/[^/]+)\/\d+px-[^/]+$/i);
	return m ? `${m[1]}/images/${m[2]}` : null;
}

export function collectWikiImageUrls(html, pageUrl) {
	const urls = [];
	const seen = new Set();
	const addUrl = (raw) => {
		if (!raw || !raw.includes("/images/")) return;
		const abs = absolutizeWikiImageUrl(pageUrl, raw);
		if (!abs || seen.has(abs)) return;
		seen.add(abs);
		urls.push(abs);
		const original = extractThumbnailOriginalUrl(abs);
		if (original && !seen.has(original)) {
			seen.add(original);
			urls.push(original);
		}
	};

	for (const match of String(html ?? "").matchAll(/<img[^>]+>/gi)) {
		const tag = match[0];
		const src = tag.match(/\bsrc="([^"]+)"/i)?.[1];
		const dataSrc = tag.match(/\bdata-src="([^"]+)"/i)?.[1];
		addUrl(src);
		addUrl(dataSrc);
	}

	return urls;
}

function selectImageUrlFor(urls, kind, slug) {
	const candidateUrls = buildKindCandidateUrls(urls, kind);
	if (!candidateUrls.length) return null;

	const matchKeys = pokemonMatchKeys(slug);
	if (!matchKeys.length) return null;

	const expectedMarkers = variantMarkersFor(slug);
	const identityMatch = candidateUrls.find((url) => {
		const stem = fileStemFromUrl(url);
		// Expand abbreviations in pre-filter so short pokemon cores (e.g. "muk") still pass
		const stemForFilter = (expectedMarkers.has('shiny') && !variantMarkersFor(stem).has('shiny') && stem.startsWith('shi'))
			? 'shiny' + stem.slice(3)
			: (expectedMarkers.has('mega') && !variantMarkersFor(stem).has('mega') && stem.startsWith('m'))
				? 'mega' + stem.slice(1)
				: stem;
		return matchKeys.some((key) => stemForFilter.includes(key)) && matchesFormIdentity(stem, slug);
	});

	if (identityMatch) return identityMatch;

	return null;
}

function toImageAsset(url) {
	return url ? { url } : undefined;
}

function isNoiseImageSet(images) {
	const urls = [images?.sprite?.url, images?.hero?.url].filter(Boolean);
	return urls.length > 0 && urls.every((url) => isNoiseMediaAsset(url, ""));
}

function showdownPokemonSlug(slug) {
	const tokens = String(slug ?? "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.filter((token) => !["tm", "tr", "boss", "champion", "golden", "big"].includes(token));
	if (!tokens.length) return "";

	const isShiny = tokens.includes("shiny");
	const formTokens = tokens.filter((token) => token !== "shiny");
	const withoutNumbers = formTokens.filter((token) => !/^\d+$/.test(token));
	const normalizedTokens = withoutNumbers.length ? withoutNumbers : formTokens;
	if (!normalizedTokens.length) return "";

	if (normalizedTokens[0] === "alolan" && normalizedTokens.length > 1) {
		return `${normalizedTokens.slice(1).join("-")}-alola`;
	}
	if (normalizedTokens[0] === "galarian" && normalizedTokens.length > 1) {
		return `${normalizedTokens.slice(1).join("-")}-galar`;
	}
	if (normalizedTokens[0] === "hisuian" && normalizedTokens.length > 1) {
		return `${normalizedTokens.slice(1).join("-")}-hisui`;
	}
	if (normalizedTokens[0] === "paldean" && normalizedTokens.length > 1) {
		return `${normalizedTokens.slice(1).join("-")}-paldea`;
	}
	if (normalizedTokens[0] === "mega" && normalizedTokens.length > 1) {
		return `${normalizedTokens.slice(1).join("-")}-mega`;
	}

	return normalizedTokens.join("-");
}

function generatedPokemonImageSet(slug) {
	const showdownSlug = showdownPokemonSlug(slug);
	if (!showdownSlug) return null;
	const url = `https://play.pokemonshowdown.com/sprites/gen5/${showdownSlug}.png`;
	return {
		sprite: toImageAsset(url),
		hero: toImageAsset(url),
	};
}

function unique(values) {
	return [...new Set(values.filter(Boolean))];
}

function fileSearchTermsForSlug(slug) {
	const tokens = imageMatchTokens(slug);
	const core = stripVariantMarkers(slug);
	return unique([
		...tokens,
		core,
		core.replace(/^\d+/, ""),
	].filter((value) => String(value).length >= 3));
}

export async function discoverWikiFileImageUrls(slug, fetchApiJson = fetchWikiApiJson) {
	const urls = [];
	const seen = new Set();

	for (const term of fileSearchTermsForSlug(slug)) {
		const payload = await fetchApiJson({
			action: "query",
			generator: "search",
			gsrnamespace: "6",
			gsrlimit: "20",
			gsrsearch: term,
			prop: "imageinfo",
			iiprop: "url",
			format: "json",
		});

		for (const page of Object.values(payload?.query?.pages ?? {})) {
			for (const imageInfo of page?.imageinfo ?? []) {
				const url = imageInfo?.url;
				if (typeof url !== "string" || !url.includes("/images/") || seen.has(url)) continue;
				seen.add(url);
				urls.push(url);
			}
		}
	}

	return urls;
}

export function extractPageImagesFromUrls(urls, slug) {
	if (!slug) return null;

	const sourceUrls = Array.isArray(urls) ? urls : [];
	const spriteUrl = selectImageUrlFor(sourceUrls, "sprite", slug);
	const heroUrl = selectImageUrlFor(sourceUrls, "hero", slug);
	const images = {
		...(spriteUrl ? { sprite: toImageAsset(spriteUrl) } : {}),
		...(heroUrl || spriteUrl ? { hero: toImageAsset(heroUrl || spriteUrl) } : {}),
	};

	return Object.keys(images).length && !isNoiseImageSet(images) ? images : null;
}

export async function discoverPageImages(slug, fetchApiJson = fetchWikiApiJson) {
	const urls = await discoverWikiFileImageUrls(slug, fetchApiJson);
	return extractPageImagesFromUrls(urls, slug) ?? generatedPokemonImageSet(slug);
}

export function extractPageImages(html, pageUrl, slug) {
	const urls = collectWikiImageUrls(html, pageUrl);
	return extractPageImagesFromUrls(urls, slug);
}

export function extractLeadWikiImageUrl(html, pageUrl, kind = "hero") {
	for (const match of String(html ?? "").matchAll(/<img[^>]+>/gi)) {
		const tag = match[0];
		const alt = tag.match(/\balt="([^"]*)"/i)?.[1] ?? "";
		const candidates = firstImageCandidatesFromTag(tag, pageUrl);
		for (const candidate of candidates) {
			if (isNoiseMediaAsset(candidate, alt)) continue;
			if (!matchesExpectedExtension(candidate, kind)) continue;
			if (kind === "sprite" && isGenericSpriteAsset(candidate)) continue;
			return candidate;
		}
	}

	return null;
}
