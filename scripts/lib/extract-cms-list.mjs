// Some index pages no longer link their children in HTML. They ship a client-side
// widget holding a `/* CMS_DATA_START */ { … }` object keyed by display name, e.g. the
// Mystery Dungeons page:
//
//   "Battle Tree House": { imageUrl, type: "azul", alias: [], wikiLink: "Battle Tree House" }
//
// Discovery walks <a> tags, so those children are invisible to it and the category ends
// up with only the handful of pages that happen to be linked elsewhere.

const CMS_DATA_MARKER = "/* CMS_DATA_START */";

function sliceBalancedObject(source, startIdx) {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = startIdx; index < source.length; index += 1) {
		const char = source[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === '"') inString = false;
			continue;
		}

		if (char === '"') inString = true;
		else if (char === "{") depth += 1;
		else if (char === "}") {
			depth -= 1;
			if (depth === 0) return source.slice(startIdx, index + 1);
		}
	}

	return null;
}

// Returns [{ name, wikiLink, imageUrl, type }] for every entry in the page's CMS list.
export function extractCmsListEntries(html) {
	const source = String(html ?? "");
	const marker = source.indexOf(CMS_DATA_MARKER);
	if (marker < 0) return [];
	const start = source.indexOf("{", marker + CMS_DATA_MARKER.length);
	if (start < 0) return [];
	const slice = sliceBalancedObject(source, start);
	if (!slice) return [];

	let parsed;
	try {
		parsed = JSON.parse(slice.replace(/,(\s*[}\]])/g, "$1"));
	} catch {
		return [];
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

	const entries = [];
	for (const [name, value] of Object.entries(parsed)) {
		if (!value || typeof value !== "object") continue;
		const link = String(value.wikiLink ?? "").trim();
		if (!link) continue;
		// "%3F%3F%3F" is the wiki's placeholder for an unrevealed page.
		let decoded = link;
		try {
			decoded = decodeURIComponent(link);
		} catch {}
		if (!decoded || /^\?+$/.test(decoded)) continue;

		entries.push({
			name: String(name).trim(),
			wikiLink: decoded,
			imageUrl: String(value.imageUrl ?? "").trim(),
			type: String(value.type ?? "").trim(),
		});
	}

	return entries;
}

// Shapes CMS entries like the link objects `shouldSkipDiscoveredLink` already consumes,
// so widget-driven children go through exactly the same filtering as real <a> links.
export function cmsEntriesAsLinks(html, baseUrl) {
	return extractCmsListEntries(html).map((entry) => {
		const target = entry.wikiLink.replace(/\s+/g, "_");
		let url = "";
		try {
			url = new URL(`/index.php/${encodeURIComponent(target).replace(/%2F/g, "/")}`, baseUrl).toString();
		} catch {
			return null;
		}

		return {
			title: entry.wikiLink,
			label: entry.name,
			url,
			hasImage: Boolean(entry.imageUrl),
			headingPath: [],
			cmsType: entry.type,
		};
	}).filter(Boolean);
}
