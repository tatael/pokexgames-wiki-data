import { dedupeRewards, parseSimpleRewardText } from "./rewards.mjs";
import { cleanStructuredText, normalizeIdToken, stripImageRefFromText } from "./text.mjs";

const QUEST_MEDIA_EXCLUDE_PATTERN = /localiza|mapa|map|banner|screen|screenshot|npc/i;
const QUEST_OBJECTIVE_PATTERNS = [
	/\b(?:derrotar|derrote)\b[^.]+/gi,
	/\b(?:capturar|capture)\b[^.]+/gi,
	/\b(?:coletar|colete)\b[^.]+/gi,
	/\b(?:entregar|entregue)\b[^.]+/gi,
	/\b(?:falar|fale|conversar|converse)\s+com\b[^.]+/gi,
	/\b(?:ir|vá|va)\s+até\b[^.]+/gi,
	/\b(?:usar|use)\b[^.]+/gi,
	/\b(?:prender|prenda)\b[^.]+/gi,
	/\b(?:desarmar|desarme)\b[^.]+/gi,
];
const QUEST_REQUIREMENT_PATTERN = /\b(requisit|necess[aá]ri|precisa|precisar[aá]?|deve|dever[aá]?|ser level|level\s*\d+\+|possuir|ter\s+fly|ter\s+rock smash|rock smash|dex\s+[a-z]|pok[eé]view|fora da montaria)\b/i;
const QUEST_WAIT_PATTERN = /\b(\d+\s*(?:hora|minuto|segundo|dia|dias|horas|minutos|segundos))\b/gi;
const QUEST_LOCATION_PATTERN = /\b(localizad|coordenadas?|cidade|city|island|ilha|town|laborat[oó]rio|quartel|cemit[eé]rio|daycare|arena|base|mapa|map)\b/i;
const QUEST_HINT_PATTERN = /\b(observa[cç][aã]o|dica|aten[cç][aã]o|nota)\b/i;

export function isQuestSupportSection(pageCategory, kind) {
	return pageCategory === "quests" && !["rewards", "tasks", "pokemon-group", "tier"].includes(kind);
}

export function isQuestStepSection(normalizedId, normalizedHeading) {
	const value = `${normalizedId} ${normalizedHeading}`.trim();
	if (!value) return false;
	if (/\b(recompensa|recompensas|reward|rewards|localizacao|localizacoes|location|locations|mapa|map|informacoes|informacao|observacoes|observacao|dicas|requisitos|requerimentos|requirements|boss mega dungeons|links?)\b/.test(value)) {
		return false;
	}
	return true;
}

export function isQuestLocationSection(normalizedId, normalizedHeading) {
	const value = `${normalizedId} ${normalizedHeading}`.trim();
	return /\b(localizacao|localizacoes|location|locations|coordenadas|mapa|map)\b/.test(value);
}

export function parseQuestSupport(paragraphs = [], items = [], media = []) {
	const intro = paragraphs.map(cleanStructuredText).filter(Boolean);
	const bullets = items
		.filter((item) => !String(item ?? "").includes("|"))
		.map(cleanStructuredText)
		.filter(Boolean);
	const cards = collectQuestSupportCards(items, media);
	return { intro, bullets, cards };
}

export function parseQuestPhase(paragraphs = [], items = [], media = []) {
	const body = paragraphs.map(cleanStructuredText).filter(Boolean);
	const bullets = items
		.filter((item) => !String(item ?? "").includes("|"))
		.map(cleanStructuredText)
		.filter(Boolean);
	const rows = items
		.filter((item) => String(item ?? "").includes("|"))
		.map(parseQuestRow)
		.filter((row) => row.cells.length >= 2);
	const requirements = [];
	const objectives = [];
	const waits = [];
	const hints = [];
	const locationNotes = [];
	const npcSet = new Set();
	const rewards = [];

	for (const text of [...body, ...bullets]) {
		collectQuestNpcs(text, npcSet);

		if (QUEST_REQUIREMENT_PATTERN.test(text)) requirements.push(text);
		if (QUEST_HINT_PATTERN.test(text)) hints.push(text);
		if (QUEST_LOCATION_PATTERN.test(text)) locationNotes.push(text);

		for (const duration of text.match(QUEST_WAIT_PATTERN) ?? []) {
			const value = cleanStructuredText(duration);
			if (value) waits.push(value);
		}

		for (const objective of extractQuestObjectives(text)) {
			objectives.push(objective);
		}

		rewards.push(...extractQuestRewards(text));
	}

	const maps = collectQuestMaps(media);
	const npcs = [...npcSet];
	const dedupedRewards = dedupeRewards(rewards);

	if (!body.length && !bullets.length && !rows.length && !requirements.length && !objectives.length && !dedupedRewards.length && !npcs.length && !waits.length && !hints.length && !locationNotes.length && !maps.length) {
		return null;
	}

	return {
		body,
		...(requirements.length ? { requirements: dedupeStrings(requirements) } : {}),
		...(objectives.length ? { objectives: dedupeStrings(objectives) } : {}),
		...(dedupedRewards.length ? { rewards: dedupedRewards } : {}),
		...(npcs.length ? { npcs } : {}),
		...(waits.length ? { waits: dedupeStrings(waits) } : {}),
		...(hints.length ? { hints: dedupeStrings(hints) } : {}),
		...(locationNotes.length ? { locations: dedupeStrings(locationNotes) } : {}),
		...(bullets.length ? { bullets } : {}),
		...(rows.length ? { rows } : {}),
		...(maps.length ? { maps } : {}),
	};
}

function collectQuestSupportCards(items = [], media = []) {
	const seen = new Set();
	const cards = [];

	for (const item of items) {
		if (!String(item ?? "").includes("|")) continue;
		for (const part of String(item ?? "").split(/\s*\|\s*/)) {
			const label = cleanStructuredText(part);
			if (!label) continue;
			const token = normalizeIdToken(label);
			if (seen.has(token)) continue;
			seen.add(token);
			cards.push({ label });
		}
	}

	for (const item of media ?? []) {
		if (!item?.url || item?.type === "video") continue;
		const source = `${item?.url ?? ""} ${item?.alt ?? ""} ${item?.slug ?? ""}`;
		if (QUEST_MEDIA_EXCLUDE_PATTERN.test(source)) continue;
		const label = cleanQuestCardLabel(item);
		if (!label) continue;
		const token = normalizeIdToken(item?.slug || label);
		if (seen.has(token)) continue;
		seen.add(token);
		cards.push({
			label,
			...(item?.slug ? { slug: item.slug } : {}),
		});
	}

	return cards;
}

function parseQuestRow(item) {
	return {
		cells: String(item ?? "")
			.split(/\s*\|\s*/)
			.map((cell) => {
				const stripped = cleanStructuredText(stripImageRefFromText(cell));
				const raw = cleanStructuredText(cell);
				return { text: stripped || raw };
			})
			.filter((cell) => cell.text),
	};
}

function extractQuestObjectives(text) {
	const values = [];
	for (const pattern of QUEST_OBJECTIVE_PATTERNS) {
		for (const match of text.match(pattern) ?? []) {
			const value = cleanStructuredText(match.replace(/[:.]$/, ""));
			if (value) values.push(value);
		}
	}

	return values;
}

function extractQuestRewards(text) {
	const matches = [];
	const rewardClausePatterns = [
		/\breceber[aá]?\s+([\s\S]+)$/i,
		/\breceber[aá]\s+de\s+recompensa\s+([\s\S]+)$/i,
		/\brecompens(?:a|ar[aá])\w*\s+(?:o jogador\s+)?(?:com\s+)?([\s\S]+)$/i,
	];

	for (const pattern of rewardClausePatterns) {
		const match = text.match(pattern);
		if (match?.[1]) {
			matches.push(String(match[1]).replace(/\.*\s*$/, "").trim());
		}
	}

	if (!matches.length && /(exp icon|experi[êe]ncia|berries|berry|ball|token|essence|gem)/i.test(text)) {
		matches.push(text);
	}

	return matches.flatMap((value) =>
		parseSimpleRewardText(
			String(value ?? "")
				.replace(/\b(?:e|and)\b/gi, " ")
				.replace(/,\s*/g, " ")
		)
	);
}

function collectQuestNpcs(text, npcSet) {
	for (const match of text.matchAll(/\bNPC\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]*(?:\s+[A-ZÀ-ÿ][A-Za-zÀ-ÿ'.-]*){0,3})/g)) {
		const value = cleanStructuredText(match[1]);
		if (value) npcSet.add(value);
	}

	for (const match of text.matchAll(/\b(?:Captain Jenny|Professor Elm|Dr\.?\s*Sakuragi|Koharu|Goh|Silver|Wallace|Darren|Blake|Alexey)\b/gi)) {
		const value = cleanStructuredText(match[0]);
		if (value) npcSet.add(value);
	}
}

function collectQuestMaps(media = []) {
	return (media ?? [])
		.filter((item) => {
			if (!item?.url || item?.type === "video") return false;
			const source = `${item?.url ?? ""} ${item?.alt ?? ""} ${item?.slug ?? ""}`;
			return /localiza|mapa|map|caminho|dungeon|andar|route/i.test(source);
		})
		.map((item) => ({
			url: item.url,
			...(item.alt ? { alt: cleanStructuredText(item.alt) } : {}),
			...(item.slug ? { slug: item.slug } : {}),
		}));
}

function dedupeStrings(values = []) {
	const seen = new Set();
	const output = [];
	for (const value of values) {
		const key = normalizeIdToken(value);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		output.push(value);
	}

	return output;
}

function cleanQuestCardLabel(item) {
	const alt = cleanStructuredText(String(item?.alt ?? "").replace(/\.(gif|png|jpe?g|webp|svg)$/i, ""));
	if (alt) return alt;
	if (item?.slug) {
		return cleanStructuredText(
			String(item.slug)
				.replace(/[-_]+/g, " ")
		);
	}

	return "";
}
