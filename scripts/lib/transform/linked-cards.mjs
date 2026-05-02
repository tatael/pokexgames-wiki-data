import { buildSlug } from "../shared.mjs";
import { cleanStructuredText, normalizeIdToken } from "./text.mjs";

function hasSeeMoreMarker(value = "") {
	const token = normalizeIdToken(value);
	return /\b(?:veja mais|veja tambem|ver mais|saiba mais|para saber mais|acesse a pagina)\b/.test(token);
}

function textBeforeSeeMoreMarker(value = "") {
	const text = cleanStructuredText(value);
	const match = text.match(/\b(?:veja\s+(?:mais|tamb\S*m)|ver\s+mais|saiba\s+mais|para\s+saber\s+mais|acesse\s+a\s+p\S*gina)\b/i);
	if (!match) return text;
	return cleanStructuredText(text.slice(0, match.index));
}

function deriveCardLabel(entry) {
	const directLabel = cleanStructuredText(entry?.label ?? "");
	if (directLabel) return directLabel;

	const title = cleanStructuredText(entry?.title ?? "");
	if (title) return title;

	const alt = cleanStructuredText(String(entry?.alt ?? "").replace(/\.(gif|png|jpg|jpeg|webp|svg)$/i, ""));
	if (alt) return alt;

	const slug = String(entry?.slug ?? "").trim();
	if (!slug) return "";
	return slug
		.split("-")
		.map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part)
		.join(" ");
}

function normalizeCardSlug(entry) {
	const slug = String(entry?.slug ?? "").trim();
	if (slug) return slug;
	const title = cleanStructuredText(entry?.title ?? "");
	return title ? buildSlug(title, "") : "";
}

function buildCards(entries = [], seen = new Set()) {
	const cards = [];
	for (const entry of entries ?? []) {
		const slug = normalizeCardSlug(entry);
		if (!slug || seen.has(slug)) continue;
		seen.add(slug);
		cards.push({
			label: deriveCardLabel(entry),
			slug,
		});
	}

	return cards.filter((card) => card.label || card.slug);
}

export function parseLinkedCards(paragraphs = [], media = [], links = [], options = {}) {
	const cleanedParagraphs = (paragraphs ?? []).map(cleanStructuredText).filter(Boolean);
	const leadIndex = cleanedParagraphs.findIndex(hasSeeMoreMarker);
	const intro = leadIndex >= 0
		? [
			...cleanedParagraphs.slice(0, leadIndex),
			textBeforeSeeMoreMarker(cleanedParagraphs[leadIndex]),
		].filter(Boolean)
		: cleanedParagraphs;
	const notes = leadIndex >= 0 ? cleanedParagraphs.slice(leadIndex + 1) : [];
	const seen = new Set();
	const linkCards = buildCards(links, seen);
	const cards = linkCards.length || options.allowMediaFallback === false
		? linkCards
		: buildCards(media, seen);

	return {
		intro,
		cards,
		notes,
	};
}
