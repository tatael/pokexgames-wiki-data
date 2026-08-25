import path from "node:path";

import { readJson, writeJson, WIKI_SOURCE_ORIGIN } from "./shared.mjs";

// The wiki serves its video sources over plain http while every image comes back https, so a
// page with an .mp4 produced entries the bundle validator rejects — and one rejected entry fails
// the whole publish. Upgrading is safe and limited to the wiki's own host, which is known to
// answer on https; an unrelated http host is left alone rather than silently rewritten.
const WIKI_HTTP_ORIGIN = WIKI_SOURCE_ORIGIN.replace(/^https:/, "http:");

export function normalizeMediaUrl(url) {
	const value = String(url ?? "").trim();
	if (!value) return "";
	if (value.startsWith(`${WIKI_HTTP_ORIGIN}/`)) {
		return `${WIKI_SOURCE_ORIGIN}${value.slice(WIKI_HTTP_ORIGIN.length)}`;
	}

	// Protocol-relative sources resolve against the page, which is https.
	if (value.startsWith("//")) return `https:${value}`;
	return value;
}

function buildMediaSignature(entry) {
	return JSON.stringify({
		type: entry?.type ?? "image",
		url: normalizeMediaUrl(entry?.url),
		alt: entry?.alt ?? "",
		width: entry?.width ?? null,
		height: entry?.height ?? null,
		slug: entry?.slug ?? null,
	});
}

function cloneMediaEntry(entry) {
	const output = {
		type: entry?.type ?? "image",
		url: normalizeMediaUrl(entry?.url),
	};

	if (entry?.alt) output.alt = entry.alt;
	if (entry?.width) output.width = entry.width;
	if (entry?.height) output.height = entry.height;
	if (entry?.slug) output.slug = entry.slug;
	return output;
}

function registerMediaEntry(entry, registry, idBySignature) {
	const signature = buildMediaSignature(entry);
	const existingId = idBySignature.get(signature);
	if (existingId) return existingId;
	const id = `m-${registry.length + 1}`;
	idBySignature.set(signature, id);
	registry.push({
		id,
		...cloneMediaEntry(entry),
	});

	return id;
}

export async function buildMediaRegistry(pagePaths = [], pagesRootDir) {
	const registry = [];
	const idBySignature = new Map();

	for (const pagePath of pagePaths) {
		const absolutePath = path.join(pagesRootDir, ...String(pagePath ?? "").split("/"));
		const page = await readJson(absolutePath);
		for (const section of page.sections ?? []) {
			const mediaRefs = {};
			for (const [locale, entries] of Object.entries(section.media ?? {})) {
				const refs = (entries ?? [])
					.filter((entry) => entry?.url)
					.map((entry) => registerMediaEntry(entry, registry, idBySignature));
				if (refs.length) mediaRefs[locale] = refs;
			}

			if (Object.keys(mediaRefs).length) {
				section.mediaRefs = mediaRefs;
			}

			delete section.media;
		}

		await writeJson(absolutePath, page);
	}

	return { entries: registry };
}
