import { buildSlug } from "../shared.mjs";
import { cleanStructuredText, normalizeIdToken } from "./text.mjs";

function parsePipeRows(items = []) {
	return (items ?? [])
		.filter((item) => String(item ?? "").includes("|"))
		.map((item) => String(item ?? "")
			.split(/\s*\|\s*/)
			.map((part) => cleanStructuredText(part))
			.filter(Boolean))
		.filter((cells) => cells.length >= 2);
}

function extractIntegers(value) {
	return [...String(value ?? "").matchAll(/\d+/g)]
		.map((match) => Number(match[0]))
		.filter((value) => Number.isFinite(value));
}

function extractLevelRanges(value) {
	const ranges = [...String(value ?? "").matchAll(/\d+\s+ao\s+\d+/gi)]
		.map((match) => cleanStructuredText(match[0]))
		.filter(Boolean);
	return ranges.length ? ranges : (cleanStructuredText(value) ? [cleanStructuredText(value)] : []);
}

function extractExperienceValues(value) {
	const matches = [...String(value ?? "").matchAll(/\d[\d.]*\s+de\s+XP/gi)]
		.map((match) => cleanStructuredText(match[0]))
		.filter(Boolean);
	return matches.length ? matches : (cleanStructuredText(value) ? [cleanStructuredText(value)] : []);
}

function extractPointValues(value) {
	const text = String(value ?? "");
	const normalized = normalizeIdToken(text);
	const pointType = /wish points/.test(normalized)
		? "Wish Points"
		: /tower points/.test(normalized)
			? "Tower Points"
			: "";
	const values = extractIntegers(text);
	return {
		pointType,
		values: values.length ? values : [],
	};
}

function splitBossAndFloor(value) {
	const text = cleanStructuredText(value);
	const match = text.match(/(.+?)\s+(\d+[°ºª]\s+Andar)$/i);
	if (!match) {
		return {
			bossLabel: text,
			floorLabel: "",
		};
	}

	return {
		bossLabel: cleanStructuredText(match[1]),
		floorLabel: cleanStructuredText(match[2]),
	};
}

function deriveCardLabel(entry) {
	const alt = cleanStructuredText(String(entry?.alt ?? "").replace(/\.(gif|png|jpg|jpeg|webp|svg)$/i, ""));
	if (alt) return alt;
	const slug = String(entry?.slug ?? "").trim();
	if (!slug) return "";
	return slug
		.split("-")
		.map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part)
		.join(" ");
}

export function isEmbeddedTowerProgressionSection(normalizedId, normalizedHeading, pageCategory) {
	return pageCategory === "embedded tower"
		&& (
			normalizedId === "funcionamento geral da embedded tower"
			|| normalizedHeading === "funcionamento geral da embedded tower"
		);
}

export function parseEmbeddedTowerProgression(paragraphs = [], items = []) {
	const intro = (paragraphs ?? []).map(cleanStructuredText).filter(Boolean);
	const attempts = [];
	const rewards = [];
	const resources = [];

	for (const cells of parsePipeRows(items)) {
		const joined = normalizeIdToken(cells.join(" "));
		if (/tower attempts/.test(joined) && cells.length === 3) {
			attempts.push({
				floorsLabel: cells[0],
				requiredAttempts: extractIntegers(cells[1])[0] ?? null,
				refundedAttempts: extractIntegers(cells[2])[0] ?? null,
			});
			continue;
		}

		if (/(tower points|wish points|xp)/.test(joined) && cells.length >= 4) {
			const points = extractPointValues(cells[3]);
			rewards.push({
				floorLabel: cells[0],
				levelRanges: extractLevelRanges(cells[1]),
				experienceValues: extractExperienceValues(cells[2]),
				pointType: points.pointType,
				pointValues: points.values,
			});
			continue;
		}

		if (cells.length >= 6) {
			resources.push({
				floorLabel: cells[0],
				potionsAndElixirs: cells[1],
				revives: cells[2],
				medicine: cells[3],
				deathPenalty: cells[4],
				berries: cells[5],
			});
		}
	}

	return {
		intro,
		attempts,
		rewards,
		resources,
	};
}

export function isEmbeddedTowerUnlockSection(normalizedId, normalizedHeading, pageCategory) {
	return pageCategory === "embedded tower"
		&& (
			normalizedId === "como liberar os andares"
			|| normalizedHeading === "como liberar os andares"
		);
}

export function parseEmbeddedTowerUnlocks(paragraphs = [], items = []) {
	const intro = (paragraphs ?? []).map(cleanStructuredText).filter(Boolean);
	const bullets = (items ?? [])
		.filter((item) => !String(item ?? "").includes("|"))
		.map(cleanStructuredText)
		.filter(Boolean);
	const entries = parsePipeRows(items).map((cells) => {
		const split = splitBossAndFloor(cells[0]);
		return {
			bossLabel: split.bossLabel,
			floorLabel: split.floorLabel,
			requirementText: cells[1],
			requiredPoints: extractIntegers(cells[1])[0] ?? null,
		};
	}).filter((entry) => entry.bossLabel || entry.floorLabel || entry.requirementText);

	return {
		intro,
		bullets,
		entries,
	};
}

export function isEmbeddedTowerLinkedCardsSection(normalizedId, normalizedHeading, pageCategory) {
	return pageCategory === "embedded tower"
		&& (
			normalizedId === "bosses"
			|| normalizedHeading === "bosses"
		);
}

export function parseLinkedCards(paragraphs = [], media = []) {
	const cleanedParagraphs = (paragraphs ?? []).map(cleanStructuredText).filter(Boolean);
	const leadIndex = cleanedParagraphs.findIndex((paragraph) =>
		/para saber mais|acesse a pagina|página desejada|click the image|clique na imagem/i.test(normalizeIdToken(paragraph))
	);
	const intro = leadIndex >= 0 ? cleanedParagraphs.slice(0, leadIndex + 1) : cleanedParagraphs;
	const notes = leadIndex >= 0 ? cleanedParagraphs.slice(leadIndex + 1) : [];
	const cards = [];
	const seen = new Set();

	for (const entry of media ?? []) {
		const slug = String(entry?.slug ?? "").trim();
		if (!slug || seen.has(slug)) continue;
		seen.add(slug);
		cards.push({
			label: deriveCardLabel(entry),
			slug,
		});
	}

	return {
		intro,
		cards: cards.filter((card) => card.label || card.slug),
		notes,
	};
}
