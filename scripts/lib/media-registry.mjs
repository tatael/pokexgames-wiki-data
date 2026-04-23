import path from "node:path";

import { readJson, writeJson } from "./shared.mjs";

function buildMediaSignature(entry) {
	return JSON.stringify({
		type: entry?.type ?? "image",
		url: entry?.url ?? "",
		alt: entry?.alt ?? "",
		width: entry?.width ?? null,
		height: entry?.height ?? null,
		slug: entry?.slug ?? null,
	});
}

function cloneMediaEntry(entry) {
	const output = {
		type: entry?.type ?? "image",
		url: entry?.url ?? "",
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
