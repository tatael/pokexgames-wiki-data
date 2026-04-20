import {
	PT_BR,
	buildSlug,
	decodeHtmlEntities,
	normalizeWhitespace,
	stripHtml,
} from "./shared.mjs";

export { extractArticleHtml, extractTitle } from "./shared.mjs";

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
			html: fullMatch,
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

	return decodeHtmlEntities(decodeURIComponent(rawTitle).replaceAll("_", " "));
}

export function buildWikiUrlFromTitle(title) {
	return `https://wiki.pokexgames.com/index.php/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
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
			headingPath: headingTrail.map((item) => item.label),
		});
	}

	return results;
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
		"first steps",
	].includes(normalized);
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

const TABBER_FALLBACK_PATTERN = /^Tabber\s+requer\s+Javascript\s+para\s+funcionar\.?\s*/i;

function cleanTableCellText(text) {
	if (!text) return "";
	let t = text;
	t = t.replace(/\bInterface\s+([\w][\w\s]*?)\s+PVE\.png\b/gi, "$1 PvE");
	t = t.replace(/\bInterface\s+([\w][\w\s]*?)\s+PVP\.png\b/gi, "$1 PvP");
	t = t.replace(/\b([A-Za-z][a-z]+)\d*\.(png|jpg)\b/g, "$1");
	t = t.replace(/\b\d[\w-]*\.(png|jpg)\b/gi, "");
	t = t.replace(/\bLink\b/gi, "");
	t = t.replace(/\s+/g, " ").trim();

	return t;
}

function findHeaderIndex(headers, candidates) {
	const normalized = headers.map((h) =>
		h.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
	);

	for (let i = 0; i < normalized.length; i += 1) {
		if (candidates.some((c) => normalized[i].includes(c))) return i;
	}

	return -1;
}

function extractCellContent(cellHtml) {
	const withAlt = cellHtml.replace(/<img\b[^>]*\balt="([^"]*)"[^>]*\/?>/gi, " $1 ");
	return stripHtml(withAlt).trim();
}

function extractTableRows(html) {
	const rows = [];
	const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;

	for (const tableMatch of html.matchAll(tableRegex)) {
		const tableHtml = tableMatch[1];
		const allRows = [];
		const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
		for (const trMatch of tableHtml.matchAll(trRegex)) {
			allRows.push(trMatch[1]);
		}

		if (allRows.length < 2) continue;

		let headerCells = null;
		let dataStart = 0;
		for (let i = 0; i < allRows.length; i += 1) {
			if (/<th\b/i.test(allRows[i]) && !/<td\b/i.test(allRows[i])) {
				const thRegex = /<th\b[^>]*>([\s\S]*?)<\/th>/gi;
				headerCells = [...allRows[i].matchAll(thRegex)].map((m) => extractCellContent(m[1]));
				dataStart = i + 1;
				break;
			}
		}

		const nameCol = headerCells ? findHeaderIndex(headerCells, ["nome", "name", "pokemon"]) : -1;
		const pveCol = headerCells ? findHeaderIndex(headerCells, ["funcao pve", "pve"]) : -1;
		const pvpCol = headerCells ? findHeaderIndex(headerCells, ["funcao pvp", "pvp"]) : -1;

		for (let i = dataStart; i < allRows.length; i += 1) {
			const rowHtml = allRows[i];
			if (!/<td\b/i.test(rowHtml)) continue;
			const tdRegex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
			const cells = [...rowHtml.matchAll(tdRegex)].map((m) => cleanTableCellText(extractCellContent(m[1])));
			if (cells.every((c) => !c)) continue;

			if (nameCol >= 0 && cells[nameCol]) {
				const name = cells[nameCol];
				const pve = pveCol >= 0 ? cells[pveCol] : "";
				const pvp = pvpCol >= 0 ? cells[pvpCol] : "";
				const roles = [pve && `PvE: ${pve}`, pvp && `PvP: ${pvp}`].filter(Boolean).join(" / ");
				rows.push(`* ${name}${roles ? ` (${roles})` : ""}`);
			} else {
				const joined = cells.filter(Boolean).join(" | ");
				if (joined) rows.push(`* ${joined}`);
			}
		}
	}

	return rows;
}

export function extractLines(html) {
	const lines = [];
	const blockRegex = /<(p|li|h2|h3|h4)[^>]*>(.*?)<\/(p|li|h2|h3|h4)>/gis;

	for (const match of html.matchAll(blockRegex)) {
		const kind = match[1]?.toLowerCase();
		const raw = stripHtml(match[2] ?? "");
		if (!kind || !raw) continue;

		const body = raw.replace(TABBER_FALLBACK_PATTERN, "").trim();
		if (!body) continue;

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

	const tableRows = extractTableRows(html);
	lines.push(...tableRows);

	if (lines.length === 0) {
		const fallback = stripHtml(html);
		if (fallback) {
			lines.push(fallback);
		}
	}

	return lines;
}

function absolutizeWikiAssetUrl(pageUrl, rawSrc) {
	const source = String(rawSrc ?? "").trim();
	if (!source) return null;
	try {
		const url = new URL(source, pageUrl);
		if (url.hostname !== "wiki.pokexgames.com" || !url.pathname.includes("/images/")) return null;
		return url.toString();
	} catch {
		return null;
	}
}

function isNoiseMediaAsset(url, alt = "") {
	const source = `${url} ${alt}`
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();

	if (/\/\d{1,2}px-[^/]+$/i.test(url)) return true;
	return /(?:^|[\/_\s-])(?:flag|bandeira|bandera|english|spanish|portuguese|usa|eua|united[-_\s]?states|spain|brasil|brazil|espanol|idioma|language)(?:[._\s-]|$)/i.test(source)
		|| /(?:^|[\/_\s-])interface[-_\s]/i.test(source)
		|| /(?:^|[\/_\s-])pokedexicon(?:[._\s-]|$)/i.test(source)
		|| /\/images\/[0-9a-f]\/[0-9a-f]{2}\/(?:bug|dark|dragon|electric|fairy|fighting|fire|flying|ghost|grass|ground|ice|normal|poison|psychic|rock|steel|water)\.(?:png|gif|jpe?g|webp)(?:\?|$)/i.test(url);
}

function extractMedia(html, pageUrl = "") {
	if (!pageUrl) return [];
	const media = [];
	const seen = new Set();
	const add = (type, rawUrl, alt = "") => {
		const url = absolutizeWikiAssetUrl(pageUrl, rawUrl);
		if (!url || seen.has(url)) return;
		if (isNoiseMediaAsset(url, alt)) return;
		seen.add(url);
		media.push({ type, url, alt: stripHtml(alt || "") });
	};

	for (const match of String(html ?? "").matchAll(/<img\b[^>]*>/gi)) {
		const tag = match[0];
		add("image", tag.match(/\bsrc="([^"]+)"/i)?.[1] ?? tag.match(/\bdata-src="([^"]+)"/i)?.[1], tag.match(/\balt="([^"]*)"/i)?.[1] ?? "");
	}

	for (const match of String(html ?? "").matchAll(/<(?:video|source)\b[^>]*>/gi)) {
		const tag = match[0];
		add("video", tag.match(/\bsrc="([^"]+)"/i)?.[1] ?? tag.match(/\bdata-src="([^"]+)"/i)?.[1], tag.match(/\balt="([^"]*)"/i)?.[1] ?? "");
	}

	return media;
}

export function extractSections(html, title, pageUrl = "") {
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
				heading: headingText,
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
				items: { [PT_BR]: items },
				media: { [PT_BR]: extractMedia(html, pageUrl) },
			},
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
			items: { [PT_BR]: items },
			media: { [PT_BR]: extractMedia(slice, pageUrl) },
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
					summary = normalizeWhitespace(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trimEnd();
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

