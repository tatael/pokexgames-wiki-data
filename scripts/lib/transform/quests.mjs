import { dedupeRewards, parseSimpleRewardText } from "./rewards.mjs";
import { cleanStructuredText, normalizeIdToken, stripImageRefFromText, stripInlineMediaRefs } from "./text.mjs";

function cleanQuestText(value) {
	let text = stripInlineMediaRefs(cleanStructuredText(value));
	text = stripParenthesizedImageRefs(text);
	text = stripTrailingFootnoteMarks(text);
	return cleanStructuredText(text);
}

function stripParenthesizedImageRefs(value) {
	return String(value ?? "")
		.replace(/\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*)(?:\(\d+\))\.(?:png|gif|webp|jpe?g|svg)\b\s*/giu, "$1 ")
		.replace(/\s{2,}/g, " ");
}

function stripTrailingFootnoteMarks(value) {
	return String(value ?? "")
		.replace(/\s+\*+\s*$/g, "")
		.replace(/\s+\*+(?=\s|$)/g, " ");
}

const ELEMENT_NAMES = [
	"Normal", "Fire", "Water", "Grass", "Electric", "Ice", "Fighting", "Poison", "Ground", "Flying",
	"Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy", "Crystal",
];
const QUEST_TYPE_LABEL_TOKENS = new Set([
	...ELEMENT_NAMES.map((name) => name.toLowerCase()),
	"poison1",
]);

function isQuestTypeLabel(label = "") {
	const tokens = normalizeIdToken(label).split(/\s+/).filter(Boolean);
	if (!tokens.length) return false;
	return tokens.every((token) => QUEST_TYPE_LABEL_TOKENS.has(token));
}

const QUEST_MEDIA_EXCLUDE_PATTERN = /localiza|mapa|map|banner|screen|screenshot|npc/i;
const QUEST_MEDIA_MAP_PATTERN = /localiza|mapa|map|caminho|dungeon|andar|route/i;
const QUEST_NOISE_LINE_PATTERN = /^(?:tabber requer javascript[^\n]*|observa[cç][oõ]es?[:.]?|aviso[:.]?)$/i;
const SHORT_NOISE_TOKEN_PATTERN = /^(?:\d{1,3}|parte(?:\s+central)?|escada|pedra|descida|t[ée]rreo|respawn|sul do|norte do|leste do|oeste do|(?:sul|norte|leste|oeste)\s+do|n\/a)$/i;

function normalizeElementName(value) {
	return String(value ?? "")
		.replace(/^Poison1$/i, "Poison")
		.replace(/\.png$/i, "");
}

function isElementTokenList(value) {
	const text = String(value ?? "").trim();
	if (!text) return false;
	const tokens = text.split(/\s+/).map((token) => token.replace(/\.png$/i, "")).filter(Boolean);
	if (!tokens.length || tokens.length > 8) return false;
	return tokens.every((token) => QUEST_TYPE_LABEL_TOKENS.has(token.toLowerCase()));
}

function parseElementList(value) {
	const seen = new Set();
	const out = [];
	for (const raw of String(value ?? "").split(/\s+/)) {
		const cleaned = normalizeElementName(cleanStructuredText(raw));
		if (!cleaned) continue;
		const key = cleaned.toLowerCase();
		if (seen.has(key) || !QUEST_TYPE_LABEL_TOKENS.has(key) && key !== "poison") continue;
		seen.add(key);
		out.push(cleaned);
	}
	return out;
}

function buildSlugFromName(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeMediaAlt(value) {
	return cleanStructuredText(String(value ?? "")
		.replace(/\.(?:png|gif|webp|jpe?g|svg)$/i, "")
		.replace(/^\d{1,4}[-_. ]+/, "")
		.replace(/[_-]+/g, " "));
}

function findPokemonSprite(name, media) {
	const target = normalizeIdToken(name);
	if (!target) return "";
	for (const item of media ?? []) {
		if (!item?.url) continue;
		const alt = normalizeMediaAlt(item.alt ?? "");
		if (normalizeIdToken(alt) === target) return item.url;
	}
	return "";
}

const QUEST_NAV_CARD_NOISE_TOKEN_PATTERN = /^(?:icone|icon|pokemon|tipagem|efetivo contra|elemento|element|exp icon|exp icon nw|sh icon|item|itens|recompensa|recompensas|nightmare topaz|nightmare amethyst|nightmare ruby|nightmare emerald|nightmare sapphire)$/i;

function isNonCardLabel(label) {
	const raw = String(label ?? "").trim();
	if (!raw) return true;
	if (/\.(?:png|gif|webp|jpe?g|svg)$/i.test(raw)) return true;
	const token = normalizeIdToken(raw);
	if (!token) return true;
	if (token.length <= 1) return true;
	if (QUEST_NAV_CARD_NOISE_TOKEN_PATTERN.test(token)) return true;
	if (SHORT_NOISE_TOKEN_PATTERN.test(token)) return true;
	if (QUEST_NOISE_LINE_PATTERN.test(token)) return true;
	if (isQuestTypeLabel(token)) return true;
	return false;
}

function isNonCardSlug(slug) {
	const text = String(slug ?? "").trim();
	if (!text) return false;
	if (text.length <= 1) return true;
	if (/^\d+$/.test(text)) return true;
	return false;
}

function isContentLine(value) {
	const text = cleanStructuredText(value);
	if (!text) return false;
	if (QUEST_NOISE_LINE_PATTERN.test(text)) return false;
	if (SHORT_NOISE_TOKEN_PATTERN.test(text)) return false;
	if (/^\(.{1,40}\)$/.test(text)) return false;
	return true;
}

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

export function parseQuestSupport(paragraphs = [], items = [], media = [], pageSlug = "") {
	const intro = dedupeStrings(paragraphs.map(cleanQuestText).flatMap(splitDenseQuestLine).filter(isContentLine));
	const introTokens = new Set(intro.map(normalizeIdToken));
	const bullets = dedupeStrings(items
		.filter((item) => !String(item ?? "").includes("|"))
		.map(cleanQuestText)
		.filter(isContentLine)
		.filter((value) => !introTokens.has(normalizeIdToken(value))));
	const cards = collectQuestSupportCards(items, media, pageSlug);
	return { intro, bullets, cards };
}

const QUEST_REWARD_QTY_RE = /^\s*((?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*[kKmM]?)\s*(?:de\s+)?/i;
const QUEST_REWARD_IMAGE_RE = /\.(?:png|gif|webp|jpe?g|svg)$/i;
const QUEST_REWARD_EXP_ICON_RE = /^exp\s+icon(\s+nw)?$/i;
// A flat reward line starts with a "big" quantity (thousands-separated or k/M) directly
// followed by an item name, with no narrative verb. Plain small ints ("10 Rainbow Orbs")
// stay because they are requirement counts, not rewards.
const QUEST_FLAT_REWARD_PREFIX_RE = /^(?:\d{1,3}(?:[.,]\d{3})+|\d+\s*[kKmM])\s+[A-ZÀ-Ý]/;
const QUEST_NARRATIVE_VERB_RE = /\b(?:dever[áa]|necess[áa]rio|n[ií]vel|encontr|falar|fale|coletad|coletar|capturad|capturar|entregar|conversar|usar|clique|jogador|aten[cç][aã]o|registrad|registrar)\b/i;

function parseQuestRewardLabel(label) {
	const trimmed = cleanStructuredText(label);
	if (!trimmed) return { qty: "1", name: "" };
	const match = trimmed.match(QUEST_REWARD_QTY_RE);
	if (!match) return { qty: "1", name: trimmed };
	const qty = match[1].replace(/\s+/g, "");
	const name = trimmed.slice(match[0].length).trim();
	if (!name) return { qty: "1", name: trimmed };
	return { qty, name };
}

function isQuestRewardRowItem(item) {
	const cells = String(item ?? "").split(/\s*\|\s*/);
	if (cells.length < 2) return false;
	const iconCell = cleanStructuredText(cells[0]);
	return QUEST_REWARD_EXP_ICON_RE.test(iconCell) || QUEST_REWARD_IMAGE_RE.test(iconCell);
}

function findIconCellMediaUrl(iconCell, media = []) {
	const want = normalizeIdToken(normalizeMediaAlt(iconCell));
	if (!want) return "";
	for (const item of media ?? []) {
		if (!item?.url) continue;
		const alt = normalizeIdToken(normalizeMediaAlt(item.alt ?? "") || normalizeMediaAlt(decodeURIComponent(String(item.url).split("/").pop() ?? "")));
		if (alt && alt === want) return item.url;
	}
	return "";
}

// Parse rewards from the raw "icon | label" reward-table rows. Uses the raw cell text
// (not parseQuestRow, which strips leading numbers as dex prefixes and would drop "50").
// Resolves the icon-cell filename to its section media URL so the reward renders the real
// icon and the overlay can dedupe it out of the trailing media gallery.
function extractRewardsFromRawRewardRows(rewardItems = [], media = []) {
	const rewards = [];
	for (const item of rewardItems) {
		const cells = String(item ?? "").split(/\s*\|\s*/).map((cell) => cleanStructuredText(cell));
		if (cells.length < 2) continue;
		const iconCell = cells[0];
		const labelCell = cells.slice(1).join(" ").trim();
		if (!iconCell || !labelCell) continue;

		const expMatch = iconCell.match(QUEST_REWARD_EXP_ICON_RE);
		if (expMatch) {
			const isNightmare = Boolean(expMatch[1]);
			const { qty } = parseQuestRewardLabel(labelCell);
			rewards.push({
				type: "loot",
				name: isNightmare ? "Nightmare Experience" : "Experiência",
				icon: isNightmare ? "nightmare-xp" : "xp",
				rarity: null,
				difficulty: null,
				qty,
			});
			continue;
		}

		if (QUEST_REWARD_IMAGE_RE.test(iconCell)) {
			const { qty, name } = parseQuestRewardLabel(labelCell);
			if (name) {
				const image = findIconCellMediaUrl(iconCell, media);
				rewards.push({ type: "loot", name, rarity: null, difficulty: null, qty, ...(image ? { image } : {}) });
			}
		}
	}

	return rewards;
}

function isFlattenedRewardLine(line) {
	const text = String(line ?? "").trim();
	if (!text) return false;
	if (!QUEST_FLAT_REWARD_PREFIX_RE.test(text)) return false;
	if (QUEST_NARRATIVE_VERB_RE.test(text)) return false;
	return true;
}

// Quest source rows often flatten "Nível Necessário: N", a location sentence, and an
// "Atenção:" note into one paragraph. Split into separate lines so the reader breaks them.
function splitDenseQuestLine(text) {
	let s = String(text ?? "").trim();
	if (!s) return [];
	const out = [];
	const level = s.match(/^(N[ií]vel\s+necess[áa]rio)\s*:?\s*(\d+)\b\s*/i);
	if (level) {
		out.push(`Nível Necessário: ${level[2]}`);
		s = s.slice(level[0].length).trim();
	}
	s = s.replace(/\s+(Aten[cç][ãa]o\s*:|Observa[cç][ãa]o\s*:)/g, "\n$1");
	for (const part of s.split(/\n|(?<=[.!?])\s+(?=[A-ZÀ-Ý])/)) {
		const piece = part.trim();
		if (piece) out.push(piece);
	}
	return out.length ? out : [s];
}

// A reward whose name is narrative prose, a raw filename, an element token, or unreasonably long
// is parser noise (usually from the prose fallback). Drop it rather than publish garbage; the
// section's table rows still carry the underlying data.
function isGarbageRewardName(name, icon) {
	if (icon === "xp" || icon === "nightmare-xp") return false;
	const text = String(name ?? "").trim();
	if (!text) return true;
	if (/\.(?:png|gif|webp|jpe?g|svg)\b/i.test(text)) return true;
	if (QUEST_NARRATIVE_VERB_RE.test(text)) return true;
	if (QUEST_TYPE_LABEL_TOKENS.has(text.toLowerCase())) return true;
	if (text.split(/\s+/).length > 6) return true;
	return false;
}

export function parseQuestPhase(paragraphs = [], items = [], media = []) {
	const pipeItems = items.filter((item) => String(item ?? "").includes("|"));
	const rewardRowItems = pipeItems.filter(isQuestRewardRowItem);
	const otherPipeItems = pipeItems.filter((item) => !isQuestRewardRowItem(item));
	const rowRewards = extractRewardsFromRawRewardRows(rewardRowItems, media);
	const rows = otherPipeItems
		.map((item) => parseQuestRow(item))
		.filter((row) => row && row.cells.length >= 2);

	const body = dedupeStrings(paragraphs.map(cleanQuestText).flatMap(splitDenseQuestLine).filter(isContentLine))
		.filter((line) => !isFlattenedRewardLine(line));
	const bodyTokens = new Set(body.map(normalizeIdToken));
	const bullets = dedupeStrings(items
		.filter((item) => !String(item ?? "").includes("|"))
		.map(cleanQuestText)
		.filter(isContentLine)
		.filter((value) => !bodyTokens.has(normalizeIdToken(value)))
		.filter((value) => !isFlattenedRewardLine(value)));

	let rewards = rowRewards;
	if (!rewards.length) {
		const fallback = [];
		for (const text of [...body, ...bullets]) {
			fallback.push(...extractQuestRewards(text));
		}
		rewards = fallback;
	}

	const maps = collectQuestMaps(media);
	const dedupedRewards = dedupeRewards(rewards).filter((reward) => !isGarbageRewardName(reward?.name, reward?.icon));

	if (!body.length && !bullets.length && !rows.length && !dedupedRewards.length && !maps.length) {
		return null;
	}

	return {
		body,
		...(dedupedRewards.length ? { rewards: dedupedRewards } : {}),
		...(bullets.length ? { bullets } : {}),
		...(rows.length ? { rows } : {}),
		...(maps.length ? { maps } : {}),
	};
}

export function parseCombatPokemonTable(items = [], media = []) {
	if (!items?.length) return null;

	const candidateRows = [];
	for (const item of items) {
		if (!String(item ?? "").includes("|")) continue;
		const parts = String(item).split(/\s*\|\s*/).map((cell) => {
			const stripped = cleanStructuredText(stripImageRefFromText(cell) || cell);
			return { text: stripped, raw: cleanStructuredText(cell) };
		});
		if (parts.length < 3) continue;
		const last = parts[parts.length - 1].text;
		const beforeLast = parts[parts.length - 2].text;
		if (!isElementTokenList(last) || !isElementTokenList(beforeLast)) continue;

		let nameCell = parts[0];
		for (const cell of parts.slice(0, parts.length - 2)) {
			if (cell.text && /[A-Za-zÀ-ÿ]/.test(cell.text) && !isElementTokenList(cell.text)) {
				nameCell = cell;
				break;
			}
		}

		const name = cleanStructuredText(nameCell.text || nameCell.raw);
		if (!name) continue;
		candidateRows.push({ name, types: parseElementList(beforeLast), counters: parseElementList(last) });
	}

	if (candidateRows.length < 2) return null;

	const seen = new Set();
	const entries = [];
	for (const row of candidateRows) {
		const slug = buildSlugFromName(row.name);
		if (!slug || seen.has(slug)) continue;
		seen.add(slug);
		const spriteUrl = findPokemonSprite(row.name, media);
		entries.push({
			name: row.name,
			slug,
			types: row.types,
			counters: row.counters,
			...(spriteUrl ? { spriteUrl } : {}),
		});
	}

	if (entries.length < 2) return null;
	return { entries };
}

function collectQuestSupportCards(items = [], media = [], pageSlug = "") {
	const seen = new Set();
	const cards = [];
	const ownSlug = String(pageSlug ?? "").trim();

	// Reward-table icon cells (e.g. "Heavy pokemon.gif", "Ultra-ball(1).png") are reward icons,
	// not navigation targets. Skip the matching media so they don't become duplicate nav cards.
	const rewardIconTokens = new Set();
	for (const item of items) {
		if (!isQuestRewardRowItem(item)) continue;
		const iconCell = cleanStructuredText(String(item ?? "").split(/\s*\|\s*/)[0] ?? "");
		const token = normalizeIdToken(normalizeMediaAlt(iconCell));
		if (token) rewardIconTokens.add(token);
	}

	for (const item of items) {
		if (!String(item ?? "").includes("|")) continue;
		const parts = String(item ?? "").split(/\s*\|\s*/).map((part) => cleanStructuredText(part));
		if (parts.length >= 3) {
			const last = parts[parts.length - 1];
			const beforeLast = parts[parts.length - 2];
			if (isElementTokenList(last) && isElementTokenList(beforeLast)) continue;
		}

		for (const part of parts) {
			const label = stripQuestLabelPrefix(part);
			if (!label) continue;
			if (isNonCardLabel(label)) continue;
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
		const altToken = normalizeIdToken(normalizeMediaAlt(item.alt ?? "") || normalizeMediaAlt(decodeURIComponent(String(item.url).split("/").pop() ?? "")));
		if (altToken && rewardIconTokens.has(altToken)) continue;
		const label = cleanQuestCardLabel(item);
		if (!label || isNonCardLabel(label)) continue;
		if (isNonCardSlug(item?.slug)) continue;
		if (ownSlug && item?.slug === ownSlug) continue;
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
	const cells = String(item ?? "")
		.split(/\s*\|\s*/)
		.map((cell) => {
			const stripped = cleanStructuredText(stripImageRefFromText(cell));
			const raw = cleanStructuredText(cell);
			return { text: stripped || raw };
		})
		.filter((cell) => cell.text);

	if (cells.length >= 3) {
		const last = cells[cells.length - 1].text;
		const beforeLast = cells[cells.length - 2].text;
		if (isElementTokenList(last) && isElementTokenList(beforeLast)) {
			return null;
		}
	}

	return { cells };
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

function collectQuestMaps(media = []) {
	return (media ?? [])
		.filter((item) => {
			if (!item?.url || item?.type === "video") return false;
			const source = `${item?.url ?? ""} ${item?.alt ?? ""} ${item?.slug ?? ""}`;
			return QUEST_MEDIA_MAP_PATTERN.test(source);
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
	const altRaw = cleanStructuredText(String(item?.alt ?? "").replace(/\.(gif|png|jpe?g|webp|svg)$/i, ""));
	const altClean = stripQuestLabelPrefix(altRaw);
	if (altClean) return altClean;
	if (item?.slug) {
		return stripQuestLabelPrefix(cleanStructuredText(
			String(item.slug).replace(/[-_]+/g, " ")
		));
	}

	return "";
}

function stripQuestLabelPrefix(value) {
	return String(value ?? "")
		.replace(/^\d{1,4}[-_\s]+/, "")
		.replace(/\s{2,}/g, " ")
		.trim();
}
