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

	const normalizedFragment = buildSlug(fragment.replaceAll("_", " "), fragment).replace(/-/g, " ");
	const panelRegex = /<article\b[^>]*\bdata-title=(?:"([^"]+)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/article>/gi;
	for (const match of html.matchAll(panelRegex)) {
		const title = decodeHtmlEntities(match[1] || match[2] || match[3] || "");
		const normalizedTitle = buildSlug(title, "").replace(/-/g, " ");
		if (normalizedTitle && normalizedTitle === normalizedFragment.replace(/\s+\d+$/, "")) {
			return match[0];
		}
	}

	const escapedFragment = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const headingRegex = /<h([1-4])[^>]*>[\s\S]*?<\/h\1>/gi;
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

	const currentHeadingIndex = headings.findIndex((heading) => {
		if (new RegExp(`id=["']${escapedFragment}["']`, "i").test(heading.html)) return true;
		const headingText = stripHtml(heading.html);
		return buildSlug(headingText, "").replace(/-/g, " ") === normalizedFragment;
	});
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

	const questData = extractWindowQuestData(html);
	if (questData) {
		try {
			const quests = JSON.parse(questData.replace(/,\s*([}\]])/g, "$1"));
			for (const quest of quests) {
				const name = String(quest?.name ?? "").trim();
				if (!name) continue;
				const link = String(quest?.link ?? "").trim() || buildWikiUrlFromTitle(name);
				let resolved;
				try {
					resolved = new URL(link, baseUrl);
				} catch {
					continue;
				}
				if (resolved.hostname !== "wiki.pokexgames.com" || !resolved.pathname.startsWith("/index.php/")) continue;
				const title = decodeWikiTitleFromUrl(resolved.toString()) ?? name;
				results.push({
					url: resolved.toString(),
					title,
					label: name,
					headingPath: [String(quest?.category ?? "").trim()].filter(Boolean),
				});
			}
		} catch {
			// Ignore malformed widget data and keep regular link discovery.
		}
	}

	return results;
}

function extractWindowQuestData(html) {
	const source = String(html ?? "");
	const markerMatch = [...source.matchAll(/window\.quests\s*=/g)].pop();
	if (!markerMatch) return "";
	const arrayStart = source.indexOf("[", markerMatch.index ?? 0);
	if (arrayStart < 0) return "";
	let depth = 0;
	let inString = false;
	let quote = "";
	let escaped = false;
	for (let index = arrayStart; index < source.length; index += 1) {
		const char = source[index];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === "\\") {
				escaped = true;
			} else if (char === quote) {
				inString = false;
				quote = "";
			}
			continue;
		}
		if (char === '"' || char === "'") {
			inString = true;
			quote = char;
			continue;
		}
		if (char === "[") depth += 1;
		if (char === "]") {
			depth -= 1;
			if (depth === 0) return source.slice(arrayStart, index + 1);
		}
	}
	return "";
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

export function isNoiseMediaAsset(url, alt = "") {
	const source = `${url} ${alt}`
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();

	if (/\/\d{1,2}px-[^/]+$/i.test(url)) return true;
	return /\/images\/[0-9a-f]\/[0-9a-f]{2}\/(?:en|es|pt|pt-br)\.(?:png|gif|jpe?g|webp)(?:\?|$)/i.test(url)
		|| /(?:^|[\/_\s-])(?:flag|bandeira|bandera|english|spanish|portuguese|usa|eua|united[-_\s]?states|spain|brasil|brazil|espanol|idioma|language)(?:[._\s-]|$)/i.test(source)
		|| /(?:^|[\/_\s-])(?:semvip|comvip|diamond)(?:[._\s-]|$)/i.test(source)
		|| /(?:^|[\/_\s-])interface[-_\s]/i.test(source)
		|| /(?:^|[\/_\s-])pokedexicon(?:[._\s-]|$)/i.test(source)
		|| /\/images\/[0-9a-f]\/[0-9a-f]{2}\/(?:bug|dark|dragon|electric|fairy|fighting|fire|flying|ghost|grass|ground|ice|normal|poison|psychic|rock|steel|water)\.(?:png|gif|jpe?g|webp)(?:\?|$)/i.test(url);
}

function extractMedia(html, pageUrl = "") {
	if (!pageUrl) return [];
	const media = [];
	const seen = new Set();
	const readTagAttr = (tag, name) => {
		const match = String(tag ?? "").match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
		return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
	};
	const readDimension = (tag, name, rawUrl = "") => {
		const attrValue = readTagAttr(tag, name);
		const attrNumber = Number.parseInt(String(attrValue).replace(/[^\d]/g, ""), 10);
		if (Number.isFinite(attrNumber) && attrNumber > 0) return attrNumber;
		if (name !== "width") return null;
		const thumbMatch = String(rawUrl ?? "").match(/\/(\d+)px-[^/]+$/i);
		const thumbWidth = Number.parseInt(thumbMatch?.[1] ?? "", 10);
		return Number.isFinite(thumbWidth) && thumbWidth > 0 ? thumbWidth : null;
	};
	const inferPokemonSlug = (url, alt) => {
		const filename = decodeURIComponent(String(alt || url).split(/[/?#]/).filter(Boolean).pop() ?? "")
			.replace(/\.[a-z0-9]+$/i, "")
			.replace(/^(\d+)[-_ ]*/, "")
			.trim();
		if (!filename || /^(banner|task|map|possivel|possible|syncamore|barry|diamond|comvip|semvip|check|checkmark|x|tower|wish)(?:\b|[-_])/i.test(filename)) return null;
		return buildSlug(filename, "");
	};
	const inferWikiLinkSlug = (href) => {
		try {
			const target = new URL(href, pageUrl);
			if (target.hostname !== "wiki.pokexgames.com" || !target.pathname.startsWith("/index.php/")) return null;
			const title = decodeURIComponent(target.pathname.slice("/index.php/".length)).replaceAll("_", " ");
			if (!title || title.includes(":")) return null;
			return buildSlug(title, "");
		} catch {
			return null;
		}
	};
	const add = (type, rawUrl, alt = "", metadata = {}) => {
		const url = absolutizeWikiAssetUrl(pageUrl, rawUrl);
		if (!url || seen.has(url)) return;
		if (isNoiseMediaAsset(url, alt)) return;
		seen.add(url);
		const entry = { type, url, alt: stripHtml(alt || "") };
		if (metadata.width) entry.width = metadata.width;
		if (metadata.height) entry.height = metadata.height;
		const slug = metadata.slug || inferPokemonSlug(url, entry.alt);
		if (slug) entry.slug = slug;
		media.push(entry);
	};

	for (const match of String(html ?? "").matchAll(/<a\b[^>]*\bhref=(?:"([^"]+)"|'([^']*)'|([^\s>]+))[^>]*>\s*(<img\b[^>]*>)\s*<\/a>/gi)) {
		const href = match[1] ?? match[2] ?? match[3] ?? "";
		const tag = match[4] ?? "";
		const rawUrl = readTagAttr(tag, "src") || readTagAttr(tag, "data-src");
		add("image", rawUrl, readTagAttr(tag, "alt"), {
			width: readDimension(tag, "width", rawUrl),
			height: readDimension(tag, "height", rawUrl),
			slug: inferWikiLinkSlug(href),
		});
	}

	for (const match of String(html ?? "").matchAll(/<img\b[^>]*>/gi)) {
		const tag = match[0];
		const rawUrl = readTagAttr(tag, "src") || readTagAttr(tag, "data-src");
		add("image", rawUrl, readTagAttr(tag, "alt"), {
			width: readDimension(tag, "width", rawUrl),
			height: readDimension(tag, "height", rawUrl),
		});
	}

	for (const match of String(html ?? "").matchAll(/<(?:video|source)\b[^>]*>/gi)) {
		const tag = match[0];
		const rawUrl = readTagAttr(tag, "src") || readTagAttr(tag, "data-src");
		add("video", rawUrl, readTagAttr(tag, "alt"), {
			width: readDimension(tag, "width", rawUrl),
			height: readDimension(tag, "height", rawUrl),
		});
	}

	return media;
}

function stripMediaAndScript(html) {
	return String(html ?? "")
		.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
		.replace(/<(?:video|source)\b[\s\S]*?<\/video>/gi, " ")
		.replace(/<(?:video|source)\b[^>]*>/gi, " ")
		.replace(/<img\b[^>]*>/gi, " ");
}

function extractTabberPanelLines(html) {
	const lines = [];
	const panelRegex = /<article\b[^>]*\bdata-title=(?:"([^"]+)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/article>/gi;
	for (const match of String(html ?? "").matchAll(panelRegex)) {
		const title = decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "").trim();
		const body = stripHtml(stripMediaAndScript(match[4] ?? "")).trim();
		if (title) lines.push(`# ${title}`);
		if (body) lines.push(body);
	}

	return lines;
}

function extractRewardTabberLines(html) {
	const lines = [];
	const panelRegex = /<article\b[^>]*\bdata-title=(?:"([^"]+)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/article>/gi;
	for (const match of String(html ?? "").matchAll(panelRegex)) {
		const title = decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "").trim();
		const panelHtml = match[4] ?? "";
		if (title) lines.push(`* ${title}`);
		const rows = extractTableRows(panelHtml);
		if (rows.length) {
			lines.push(...rows);
			continue;
		}
		const body = stripHtml(stripMediaAndScript(panelHtml)).trim();
		if (body) lines.push(`* ${body}`);
	}

	return lines;
}

export function extractSections(html, title, pageUrl = "") {
	let headingRegex = /<h2[^>]*>(.*?)<\/h2>/gis;
	const headings = [];

	for (const match of String(html ?? "").matchAll(headingRegex)) {
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

	if (headings.length > 0 && headings.every((entry) => buildSlug(entry.heading, "") === "indice")) {
		headings.length = 0;
	}

	if (headings.length === 0) {
		headingRegex = /<h3[^>]*>(.*?)<\/h3>/gis;
		for (const match of String(html ?? "").matchAll(headingRegex)) {
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
		const isRewardSection = buildSlug(entry.heading, "") === "recompensas" || buildSlug(entry.heading, "") === "recompensa" || buildSlug(entry.heading, "") === "rewards";
		const tabberLines = isRewardSection ? extractRewardTabberLines(slice) : extractTabberPanelLines(slice);
		const lines = tabberLines.length ? tabberLines : extractLines(slice);
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

