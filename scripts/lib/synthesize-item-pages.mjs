import { readFile } from "node:fs/promises";
import path from "node:path";

import { HTML_CACHE_DIR, PT_BR, SOURCE_NAME, WIKI_SOURCE_ORIGIN, buildSlug, nowRfc3339, writeJson } from "./shared.mjs";

function loc(value) {
	return value && typeof value === "object" ? (value[PT_BR] ?? null) : (value ?? null);
}

function normText(value) {
	return String(value ?? "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function compact(value) {
	return normText(value).replace(/\s+/g, "");
}

// A filename-style row value ("Ice-cream-camera") becomes a readable name ("Ice Cream Camera").
function cleanItemName(value) {
	const raw = String(value ?? "").trim();
	if (/\s/.test(raw)) return raw;
	return raw.replace(/[-_]+/g, " ").replace(/\b\p{L}/gu, (ch) => ch.toUpperCase()).trim();
}

// The Big Figures page lists each figure in per-rank tables where every cell is one figure:
// "Name $Price" + the figure image. Its published JSON flattens this, so parse the source HTML.
const BIG_FIGURE_RANKS = [
	{ id: "Big_Figures_Rank_D", rank: "D" },
	{ id: "Big_Figures_Rank_C", rank: "C" },
	{ id: "Big_Figures_Rank_B", rank: "B" },
	{ id: "Big_Figure_Rank_A", rank: "A" },
	{ id: "Pikachu_Big_Figure", rank: "Especial" },
];

function extractBigFigureItems(html) {
	const clean = String(html ?? "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
	const items = [];
	for (const { id, rank } of BIG_FIGURE_RANKS) {
		const idx = clean.indexOf(`id="${id}"`);
		if (idx < 0) continue;
		const table = clean.slice(idx, idx + 6000).match(/<table\b[\s\S]*?<\/table>/i);
		if (!table) continue;
		for (const cellMatch of table[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)) {
			const cell = cellMatch[1];
			const src = cell.match(/src="([^"]+)"/)?.[1] ?? "";
			const text = cell.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
			const name = text.replace(/\$[\d.,]+.*$/, "").trim();
			if (!name) continue;
			const price = text.match(/\$[\d.,]+/)?.[0] ?? "";
			const iconUrl = src ? (/^https?:/i.test(src) ? src : `${WIKI_SOURCE_ORIGIN}${src}`) : "";
			items.push({ name, price, rank, iconUrl });
		}
	}
	return items;
}

// Landing/index pages in the Itens category enumerate items in tables. Split those rows into
// individual item pages so the category lists items, not the index page.
const LANDING_EXTRACT = [
	{
		slug: "cameras",
		group: { [PT_BR]: "Câmeras e decorações", en: "Cameras and decorations", es: "Cámaras y decoraciones" },
		isItemRow: (name) => /\bcam(?:era)?\b/i.test(name) && !/^t[íi]tulo$/i.test(name),
	},
];

export async function synthesizeItemPages({ pages, pagesDir, mediaEntries }) {
	const byId = new Map((mediaEntries ?? []).map((entry) => [entry.id, entry]));
	const bySlug = new Map(pages.map((page) => [page.slug, page]));
	const existingTitles = new Set(
		pages
			.filter((page) => page.category === "items" && page.displayInList !== false)
			.map((page) => normText(loc(page.title))),
	);
	const takenSlugs = new Set(pages.map((page) => page.slug));
	const newEntries = [];
	const recategorized = [];
	const hideSlugs = new Set();

	for (const cfg of LANDING_EXTRACT) {
		const landing = pages.find((page) => page.slug === cfg.slug && page.category === "items");
		if (!landing?.pagePath) continue;
		hideSlugs.add(cfg.slug);

		let pageJson;
		try {
			pageJson = JSON.parse(await readFile(path.join(pagesDir, ...landing.pagePath.split("/")), "utf8"));
		} catch {
			continue;
		}

		const seen = new Set();
		for (const section of pageJson.sections ?? []) {
			const tables = loc(section.tables) ?? [];
			const sectionMedia = (loc(section.mediaRefs) ?? []).map((id) => byId.get(id)).filter(Boolean);
			for (const table of tables) {
				for (const row of table.rows ?? []) {
					const cells = (row.cells ?? []).map((cell) => String(cell?.text ?? "").trim());
					const name = cells[0];
					if (!name || !cfg.isItemRow(name)) continue;
					const key = normText(name);
					if (seen.has(key) || existingTitles.has(key)) continue;
					seen.add(key);

					const slug = buildSlug(name, name);
					const existingPage = bySlug.get(slug);
					if (existingPage) {
						// The item already has a page but it is hidden or filed under another
						// category (e.g. an event). Pull it into Itens so it shows there.
						recategorized.push({ slug, group: cfg.group });
						continue;
					}
					if (takenSlugs.has(slug)) continue;
					takenSlugs.add(slug);

					const displayName = cleanItemName(name);
					const obtain = cells[1] ?? "";
					const rarity = cells[2] ?? "";
					const compactName = compact(name);
					const icon = sectionMedia.find((item) => {
						const alt = compact(String(item.alt ?? "").replace(/\.(png|gif|jpe?g|webp|svg)$/i, ""));
						return alt && (alt.includes(compactName) || compactName.includes(alt));
					});

					const facts = [];
					if (rarity) facts.push({ label: "Raridade", value: rarity });
					if (obtain) facts.push({ label: "Como obter", value: obtain });

					const title = { [PT_BR]: displayName, en: displayName, es: displayName };
					const images = icon?.url ? { sprite: { url: icon.url }, hero: { url: icon.url } } : null;
					const synthPage = {
						category: "items",
						slug,
						url: landing.url,
						source: pageJson.source,
						fetchedAt: pageJson.fetchedAt,
						pageKind: "item",
						title,
						summary: { [PT_BR]: obtain || displayName, en: displayName, es: displayName },
						pageGroup: cfg.group,
						...(images ? { images } : {}),
						sections: [{
							id: "informacoes",
							title: { [PT_BR]: "Informações", en: "Information", es: "Información" },
							kind: "info",
							...(facts.length ? { facts: { [PT_BR]: facts, en: facts, es: facts } } : {}),
							...(icon ? { mediaRefs: { [PT_BR]: [icon.id], en: [icon.id], es: [icon.id] } } : {}),
						}],
						metadata: { sourceType: "synthesized-item", pageKind: "item", navigationPath: "", sourceFragment: "" },
					};

					const pagePath = `items/synthesized/${slug}.json`;
					await writeJson(path.join(pagesDir, ...pagePath.split("/")), synthPage);
					newEntries.push({
						category: "items",
						slug,
						url: landing.url,
						pageKind: "item",
						title,
						summary: synthPage.summary,
						pageGroup: cfg.group,
						...(images ? { images } : {}),
						fetchedAt: pageJson.fetchedAt,
						pagePath,
					});
				}
			}
		}
	}

	// Big Figures: split each rank table's figures into individual item pages (source HTML,
	// since the published page flattens the tables).
	const bigFigures = pages.find((page) => page.slug === "big-figures" && page.category === "items");
	if (bigFigures) {
		hideSlugs.add("big-figures");
		const group = { [PT_BR]: "Big Figures", en: "Big Figures", es: "Big Figures" };
		let html = "";
		try {
			html = await readFile(path.join(HTML_CACHE_DIR, "big-figures.html"), "utf8");
		} catch { /* no cached html */ }
		for (const figure of extractBigFigureItems(html)) {
			const title = { [PT_BR]: `${figure.name} Big Figure`, en: `${figure.name} Big Figure`, es: `${figure.name} Big Figure` };
			const slug = buildSlug(title[PT_BR], title[PT_BR]);
			if (takenSlugs.has(slug)) continue;
			takenSlugs.add(slug);
			const facts = [];
			if (figure.rank) facts.push({ label: "Rank", value: figure.rank });
			if (figure.price) facts.push({ label: "Preço", value: figure.price });
			const images = figure.iconUrl ? { sprite: { url: figure.iconUrl }, hero: { url: figure.iconUrl } } : null;
			const synthPage = {
				category: "items",
				slug,
				url: bigFigures.url,
				source: SOURCE_NAME,
				fetchedAt: nowRfc3339(),
				pageKind: "item",
				title,
				summary: { [PT_BR]: `Big Figure (Rank ${figure.rank})`, en: title.en, es: title.es },
				pageGroup: group,
				...(images ? { images } : {}),
				sections: [{
					id: "informacoes",
					title: { [PT_BR]: "Informações", en: "Information", es: "Información" },
					kind: "info",
					...(facts.length ? { facts: { [PT_BR]: facts, en: facts, es: facts } } : {}),
				}],
				metadata: { sourceType: "synthesized-item", pageKind: "item", navigationPath: "", sourceFragment: "" },
			};
			const pagePath = `items/synthesized/${slug}.json`;
			await writeJson(path.join(pagesDir, ...pagePath.split("/")), synthPage);
			newEntries.push({
				category: "items",
				slug,
				url: bigFigures.url,
				pageKind: "item",
				title,
				summary: synthPage.summary,
				pageGroup: group,
				...(images ? { images } : {}),
				fetchedAt: synthPage.fetchedAt,
				pagePath,
			});
		}
	}

	return { newEntries, recategorized, hideSlugs };
}
