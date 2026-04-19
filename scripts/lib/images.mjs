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

	return Boolean(expectedCore) && expectedCore === stemCore && expectedMarkers.size === stemMarkers.size
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

export function extractPageImagesFromUrls(urls, slug) {
	if (!urls.length || !slug) return null;

	const spriteUrl = selectImageUrlFor(urls, "sprite", slug);
	const heroUrl = selectImageUrlFor(urls, "hero", slug);
	const images = {
		...(spriteUrl ? { sprite: toImageAsset(spriteUrl) } : {}),
		...(heroUrl ? { hero: toImageAsset(heroUrl) } : {}),
	};

	return Object.keys(images).length ? images : null;
}

export function extractPageImages(html, pageUrl, slug) {
	const urls = collectWikiImageUrls(html, pageUrl);
	return extractPageImagesFromUrls(urls, slug);
}
