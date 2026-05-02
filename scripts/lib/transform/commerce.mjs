import { cleanStructuredText } from "./text.mjs";

const IMAGE_REF_RE = /\b[\p{L}\p{N}_%()'-]+(?:\s+[\p{L}\p{N}_%()'-]+){0,5}\.(?:png|gif|webp|jpe?g|svg)/giu;
const COMPACT_IMAGE_REF_RE = /\b[\p{L}\p{N}_%()'-]+\.(?:png|gif|webp|jpe?g|svg)/giu;

function parsePipeRows(items = []) {
	return (items ?? [])
		.filter((item) => String(item ?? "").includes("|"))
		.map((item) => String(item ?? "")
			.split(/\s*\|\s*/)
			.map((part) => cleanStructuredText(part))
			.filter(Boolean))
		.filter((cells) => cells.length >= 2);
}

export function isCommerceSection(normalizedId, normalizedHeading, pageKind = "") {
	const token = `${normalizedId} ${normalizedHeading} ${pageKind}`;
	return /\b(exchange|troca|trocando|shop|loja|mercado|craft|crafts|custo|custos|cost|costs|preco|precos|price|prices|recompensa|recompensas|profit|lucro|ganancia|ganho|pontuacao|pontos|points|ticket|tokens?|jewels?|joia|joias|slot)\b/.test(token);
}

export function parseCommerceEntries(normalizedId, normalizedHeading, pageKind = "", paragraphs = [], items = []) {
	const token = `${normalizedId} ${normalizedHeading} ${pageKind}`;
	const type = /\b(exchange|troca)\b/.test(token)
		? "exchange"
		: /\b(shop|loja)\b/.test(token)
			? "shop"
			: /\b(craft|crafts)\b/.test(token)
				? "craft"
				: /\b(custo|custos|cost|costs|preco|precos|price|prices|profit|lucro|ganancia|ganho|pontuacao|pontos|points)\b/.test(token)
					? "cost"
					: "generic";

	return {
		type,
		intro: (paragraphs ?? []).map(cleanStructuredText).filter(Boolean),
		bullets: (items ?? [])
			.filter((item) => !String(item ?? "").includes("|"))
			.map(cleanStructuredText)
			.filter(Boolean),
		rows: parsePipeRows(items).map((cells) => ({
			cells: cells.map((text) => ({ text })),
		})),
	};
}

function singularToken(value) {
	return String(value ?? "")
		.toLowerCase()
		.replace(/ies$/, "y")
		.replace(/s$/, "");
}

function normalizeNameToken(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.split(/\s+/)
		.map(singularToken)
		.join(" ");
}

function stripImageReferences(value, { allowSpaced = false } = {}) {
	return cleanStructuredText(String(value ?? "")
		.replace(allowSpaced ? IMAGE_REF_RE : COMPACT_IMAGE_REF_RE, " ")
		.replace(/\s+/g, " ")
		.trim());
}

function cleanDuplicatedHalves(value) {
	const text = String(value ?? "").trim();
	if (!text) return "";
	const words = text.split(/\s+/);
	if (words.length % 2 !== 0) return text;
	const half = words.length / 2;
	const left = words.slice(0, half).join(" ");
	const right = words.slice(half).join(" ");
	return normalizeNameToken(left) === normalizeNameToken(right) ? right : text;
}

function parseCraftResult(value) {
	const text = cleanDuplicatedHalves(stripImageReferences(value, { allowSpaced: true }));
	const qtyMatch = text.match(/\((\d+)x\)\s*$/i);
	const quantity = qtyMatch ? Number(qtyMatch[1]) : 1;
	const name = cleanStructuredText(text.replace(/\s*\(\d+x\)\s*$/i, "").trim());
	return name ? { name, quantity } : null;
}

function parseCraftSkill(value) {
	const match = String(value ?? "").match(/\d+/);
	return match ? Number(match[0]) : null;
}

function removeTrailingNextLabel(text, nextSegment = "") {
	const value = String(text ?? "").trim();
	const nextWords = String(nextSegment ?? "").trim().split(/\s+/).filter(Boolean);
	if (!value || !nextWords.length) return value;
	for (let count = Math.min(5, nextWords.length); count >= 1; count -= 1) {
		const candidate = nextWords.slice(0, count).join(" ");
		if (!candidate) continue;
		const re = new RegExp(`\\s+${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
		if (re.test(value) && normalizeNameToken(candidate)) {
			return value.replace(re, "").trim();
		}
	}

	return value;
}

function parseCraftIngredients(value) {
	const text = stripImageReferences(value);
	if (!text) return [];
	const matches = [...text.matchAll(/\b(\d+(?:[.,]\d+)?)\b/g)];
	const entries = [];
	for (const [index, match] of matches.entries()) {
		const amount = Number(String(match[1]).replace(",", "."));
		if (!Number.isFinite(amount) || amount <= 0) continue;
		const nameStart = (match.index ?? 0) + match[0].length;
		const nameEnd = matches[index + 1]?.index ?? text.length;
		const nextNameStart = matches[index + 1]
			? (matches[index + 1].index ?? 0) + matches[index + 1][0].length
			: text.length;
		const nextNameEnd = matches[index + 2]?.index ?? text.length;
		const rawName = text.slice(nameStart, nameEnd).trim();
		const nextRawName = text.slice(nextNameStart, nextNameEnd).trim();
		const name = cleanDuplicatedHalves(cleanStructuredText(removeTrailingNextLabel(rawName, nextRawName)));
		if (!name || /^\d+$/.test(name)) continue;
		entries.push({ name, amount });
	}

	return entries;
}

export function parseCraftEntries(normalizedHeading, items = []) {
	const rank = cleanStructuredText(String(normalizedHeading ?? "")
		.replace(/\brank\b/i, "Rank")
		.replace(/\s+/g, " ")
		.trim());
	return parsePipeRows(items)
		.map((cells) => {
			if (cells.length < 4) return null;
			const result = parseCraftResult(cells[0]);
			const ingredients = parseCraftIngredients(cells[3]);
			if (!result || !ingredients.length) return null;
			const entry = {
				result,
				skill: parseCraftSkill(cells[1]),
				duration: cleanStructuredText(cells[2]),
				ingredients,
			};
			if (rank) entry.rank = rank;
			if (cells[4]) entry.station = stripImageReferences(cells[4]);
			return entry;
		})
		.filter(Boolean);
}
