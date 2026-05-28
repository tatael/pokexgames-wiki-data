import { PT_BR } from "../shared.mjs";
import { normalizeIdToken } from "./text.mjs";

const KANTO_CITIES = [
	"Pallet", "Viridian", "Pewter", "Cerulean", "Vermilion", "Lavender", "Celadon",
	"Fuchsia", "Saffron", "Cinnabar",
];

const JOHTO_CITIES = [
	"New Bark Town", "Cherrygrove City", "Violet City", "Azalea Town", "Goldenrod City",
	"Ecruteak City", "Olivine City", "Cianwood City", "Mahogany Town", "Blackthorn City",
	"Silver Town", "Safari Zone",
];

const NIGHTMARE_CITIES = [
	"Shamouti", "Alto Mare", "Astral Ruins", "Hurricane Island", "Cosmic Island",
	"Jungle Island", "Leaf Island", "Hamlin Island", "Murcott Island", "Star Island",
	"Magma Island", "Mandarin Island", "Tropical Island",
];

const ALL_CITIES = [...KANTO_CITIES, ...JOHTO_CITIES, ...NIGHTMARE_CITIES];

const REGION_TOKENS = new Set(["kanto", "johto", "nightmare", "orre", "outland", "trade center", "hoenn", "arquipelago laranja"]);

function localizedValues(field = {}) {
	if (!field || typeof field !== "object") return [];
	return Object.values(field).flat();
}

function collectAllText(sections = []) {
	const buckets = [];
	for (const section of sections ?? []) {
		const title = section?.title?.[PT_BR] ?? "";
		if (title) buckets.push(title);
		const paragraphs = section?.paragraphs?.[PT_BR] ?? [];
		const items = section?.items?.[PT_BR] ?? [];
		buckets.push(...paragraphs, ...items);
		const phase = section?.questPhases?.[PT_BR] ?? {};
		buckets.push(...(phase.body ?? []), ...(phase.bullets ?? []), ...(phase.objectives ?? []), ...(phase.requirements ?? []), ...(phase.hints ?? []));
		const support = section?.questSupport?.[PT_BR] ?? {};
		buckets.push(...(support.intro ?? []), ...(support.bullets ?? []));
	}
	return buckets.map((value) => String(value ?? "")).filter(Boolean);
}

function extractMinLevel(textBlocks = []) {
	const candidates = [];
	const patterns = [
		/\b(?:n[ií]vel|level|lvl)\s+m[ií]nimo\s*:?\s*(\d{1,4})/gi,
		/\b(?:n[ií]vel|level|lvl)\s+(\d{1,4})\s*\+?/gi,
		/\b(\d{1,4})\s*\+\s*(?:n[ií]vel|level|lvl)\b/gi,
	];
	for (const text of textBlocks) {
		for (const pattern of patterns) {
			pattern.lastIndex = 0;
			for (const match of text.matchAll(pattern)) {
				const value = parseInt(match[1], 10);
				if (Number.isFinite(value) && value > 0 && value < 2000) candidates.push(value);
			}
		}
	}
	if (!candidates.length) return null;
	return Math.min(...candidates);
}

function extractPremiumStatus(textBlocks = []) {
	const joined = textBlocks.join(" \n ").toLowerCase();
	const hasVip = /\b(vip|premium)\b/.test(joined);
	const hasFree = /\b(free|gratuita|gratuita\b|conta\s+free)\b/.test(joined);
	if (hasVip && !hasFree) return "vip";
	if (hasFree && !hasVip) return "free";
	if (hasVip && hasFree) return "both";
	return null;
}

function extractRegion(navigationPath = [], cities = []) {
	for (const segment of navigationPath ?? []) {
		const token = normalizeIdToken(segment ?? "");
		if (REGION_TOKENS.has(token)) {
			return segment;
		}
	}
	const cityRegion = inferRegionFromCities(cities);
	return cityRegion ?? null;
}

function inferRegionFromCities(cities = []) {
	const counts = { Kanto: 0, Johto: 0, Nightmare: 0 };
	for (const city of cities ?? []) {
		if (KANTO_CITIES.includes(city)) counts.Kanto += 1;
		else if (JOHTO_CITIES.includes(city)) counts.Johto += 1;
		else if (NIGHTMARE_CITIES.includes(city)) counts.Nightmare += 1;
	}
	const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
	return best[1] > 0 ? best[0] : null;
}

function extractCities(textBlocks = [], navigationPath = []) {
	const found = new Set();
	const navToken = normalizeIdToken((navigationPath ?? []).join(" "));
	for (const city of ALL_CITIES) {
		if (navToken.includes(normalizeIdToken(city))) {
			found.add(city);
		}
	}
	if (found.size) return [...found];
	const blob = textBlocks.join(" \n ");
	for (const city of ALL_CITIES) {
		const pattern = new RegExp(`\\b${city.replace(/\s+/g, "\\s+")}\\b`, "i");
		if (pattern.test(blob)) found.add(city);
	}
	return [...found];
}

function classifyReward(reward = {}) {
	const icon = normalizeIdToken(reward.icon ?? "");
	const name = normalizeIdToken(reward.name ?? "");
	if (icon === "xp" || /experiencia(?!\s+nightmare)/.test(name) && !name.includes("nightmare")) {
		if (name.includes("nightmare")) return "nightmare-experience";
		return "experience";
	}
	if (icon === "nightmare xp" || /nightmare/.test(name)) return "nightmare-experience";
	if (/\b(?:dollar|dollars|money|cash|kk)\b/.test(name)) return "money";
	if (/\b(?:ball|ultra ball|poke ball|nightmare ball|fast ball)\b/.test(name)) return "item";
	if (/\b(?:potion|elixir|revive|berry|berries|fruit)\b/.test(name)) return "item";
	return "item";
}

function extractRewardTypes(sections = []) {
	const types = new Set();
	for (const section of sections ?? []) {
		const sectionRewards = localizedValues(section?.rewards ?? {});
		for (const reward of sectionRewards) {
			types.add(classifyReward(reward));
		}
		const phase = section?.questPhases?.[PT_BR] ?? {};
		for (const reward of phase.rewards ?? []) {
			types.add(classifyReward(reward));
		}
	}
	return [...types];
}

const NIGHTMARE_NW_LEVEL_RE = /\bn[ií]vel\s+nw\s+necess[aá]rio\b|\bnw\s+necess[aá]rio\b|\bn[ií]vel\s+nightmare\s+necess[aá]rio\b/i;
const NIGHTMARE_CONTENT_TOKENS = /\bnightmare\b|\bdarkrai\b|\bcursed\b|\bsh\.?\s+[a-z]+|\bshiny\s+nidoking\b/i;
const NIGHTMARE_REWARD_NAME_RE = /\bnightmare[- ]?(?:experience|topaz|amethyst|ruby|emerald|sapphire|gem|token|fragment|essence|key|ball)\b/i;

function looksNightmare({ sections = [], rewardTypes = [], textBlocks = [] }) {
	if (rewardTypes.includes("nightmare-experience")) return true;
	for (const text of textBlocks) {
		if (NIGHTMARE_NW_LEVEL_RE.test(text)) return true;
	}
	for (const section of sections ?? []) {
		const sectionRewards = localizedValues(section?.rewards ?? {});
		for (const reward of sectionRewards) {
			const name = String(reward?.name ?? "");
			if (NIGHTMARE_REWARD_NAME_RE.test(name)) return true;
		}
		const phase = section?.questPhases?.[PT_BR] ?? {};
		for (const reward of phase.rewards ?? []) {
			if (NIGHTMARE_REWARD_NAME_RE.test(String(reward?.name ?? ""))) return true;
		}
	}
	let nightmareMentions = 0;
	for (const text of textBlocks) {
		if (NIGHTMARE_CONTENT_TOKENS.test(text)) nightmareMentions += 1;
		if (nightmareMentions >= 3) return true;
	}
	return false;
}

export function extractQuestMetadata({ sections = [], navigationPath = [] } = {}) {
	const textBlocks = collectAllText(sections);
	const metadata = {};
	const minLevel = extractMinLevel(textBlocks);
	if (minLevel !== null) metadata.minLevel = minLevel;
	const premium = extractPremiumStatus(textBlocks);
	if (premium) metadata.premium = premium;
	const cities = extractCities(textBlocks, navigationPath);
	if (cities.length) metadata.cities = cities;
	const region = extractRegion(navigationPath, cities);
	if (region) metadata.region = region;
	const rewardTypes = extractRewardTypes(sections);
	if (rewardTypes.length) metadata.rewardTypes = rewardTypes;
	if (looksNightmare({ sections, rewardTypes, textBlocks })) metadata.nightmare = true;
	return Object.keys(metadata).length ? metadata : null;
}
