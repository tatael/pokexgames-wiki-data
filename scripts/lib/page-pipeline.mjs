import { PT_BR, decodeHtmlEntities, normalizeWhitespace } from "./shared.mjs";
import { structureSection } from "./transform.mjs";

export function cleanDisplayText(value) {
	let text = String(value ?? "");
	if (/[ÃÂâ]/.test(text)) {
		const repaired = Buffer.from(text, "latin1").toString("utf8");
		if (!repaired.includes("�")) text = repaired;
	}

	return normalizeWhitespace(decodeHtmlEntities(text))
		.replace(/\s+([,.;:!?])/g, "$1")
		.replace(/([([{])\s+/g, "$1")
		.replace(/\s+([)\]}])/g, "$1")
		.trim();
}

export function mirrorLocalizedText(value) {
	const cleanValue = cleanDisplayText(value);
	return {
		[PT_BR]: cleanValue,
		en: cleanValue,
		es: cleanValue,
	};
}

export function getLocalizedStructuredValue(values) {
	return values?.[PT_BR]
		?? values?.en
		?? values?.es
		?? Object.values(values ?? {})[0]
		?? null;
}

export function resolvePokemonProfile(sections) {
	for (const section of sections ?? []) {
		const profile = getLocalizedStructuredValue(section.profile);
		if (profile) {
			return {
				[PT_BR]: profile,
				en: profile,
				es: profile,
			};
		}
	}

	return null;
}

const GUARDIAN_DUNGEON_SLUGS = new Set([
	"mystery-dungeon-dorabelle-s-wrath",
	"mystery-dungeon-the-darkness",
	"mystery-dungeon-the-celestial-serpent",
	"mystery-dungeon-below-zero",
	"mystery-dungeon-the-magma-insurgency",
]);

const DIMENSIONAL_DIFFICULTY_SLUGS = new Set([
	"bronze-dungeons",
	"silver-dungeons",
	"golden-dungeons",
	"gold-dungeons",
	"crystal-dungeons",
	"master-dungeons",
]);

const EMBEDDED_TOWER_TOP_LEVEL_SLUGS = new Set([
	"funcionamento-da-embedded-tower",
	"embedded-tower-primeiro-ao-quarto-andar",
	"embedded-tower-quinto-andar",
	"camara-do-jirachi",
	"embedded-tower-setimo-andar",
	"wes-quest",
]);

const TERRITORY_GUARDIAN_BOSS_SLUGS = new Set([
	"dorabelle",
	"giant-tyranitar",
	"giant-dragonair",
	"giant-mamoswine",
	"giant-magcargo",
]);

function normalizeCategoryText(value) {
	return cleanDisplayText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function looksLikeDailyMission(title, navigationPath = []) {
	const text = normalizeCategoryText(`${title} ${navigationPath.join(" ")}`);
	return /\bdaily\s+(kill|catch|dz|gift)\b/.test(text)
		|| /\bmissoes?\s+diarias?\b/.test(text);
}

function looksLikeQuestOrEvent(title, navigationPath = [], pageKind = "") {
	const text = normalizeCategoryText(`${title} ${navigationPath.join(" ")} ${pageKind}`);
	return /\bquest\b/.test(text)
		|| /\beventos?\b/.test(text)
		|| /\bdungeons?\b/.test(text)
		|| /\bboss\b/.test(text)
		|| /\bdefender\b/.test(text);
}

function looksLikeActualQuestSpoiler(title, navigationPath = [], pageKind = "") {
	const text = normalizeCategoryText(`${title} ${navigationPath.join(" ")} ${pageKind}`);
	if (!/\bquest\b/.test(text) && !/\bspoilers?\b/.test(text)) return false;
	return !/\b(item|items|itens|bag|bags|backpack|box|camera|coin|coins?|stone|ticket|token|rewards?)\b/.test(text);
}

function looksLikeDimensionalPage(title, navigationPath = []) {
	const text = normalizeCategoryText(`${title} ${navigationPath.join(" ")}`);
	return /\bdz\b|\bdimensional\b/.test(text);
}

function looksLikeEventPage(title, navigationPath = []) {
	const text = normalizeCategoryText(`${title} ${navigationPath.join(" ")}`);
	return /\beventos?\b|\bevents?\b|\bdefender\b|\bchristmas\b|\bnatal\b/.test(text);
}

function looksLikeNonNpcPage(title, navigationPath = []) {
	const text = normalizeCategoryText(`${title} ${navigationPath.join(" ")}`);
	return /\bquest\b|\btask\b|\btasks\b|\bfur\b|\bitem\b|\bitens\b|\bcraft\b|\bprofession\b|\bprofissao\b/.test(text);
}

function isTranslatedVariantTitle(value) {
	const title = cleanDisplayText(value);
	return /\s+\((?:en|eng|english|es|esp|spanish|pt|br|portugu[eê]s)\)$/i.test(title)
		|| /\s+(?:en|eng|es|esp|pt|br)$/i.test(title);
}

function localizedGroup(pt, en, es) {
	return {
		[PT_BR]: pt,
		en,
		es,
	};
}

function cleanLocalizedTextMap(value, fallback) {
	const base = value && typeof value === "object" ? value : fallback;
	return {
		[PT_BR]: cleanDisplayText(base?.[PT_BR] ?? base?.en ?? base?.es ?? ""),
		en: cleanDisplayText(base?.en ?? base?.[PT_BR] ?? base?.es ?? ""),
		es: cleanDisplayText(base?.es ?? base?.[PT_BR] ?? base?.en ?? ""),
	};
}

export function resolveCategory(category, slug, profile, entry = {}) {
	if (profile) {
		return "pokemon";
	}

	if (GUARDIAN_DUNGEON_SLUGS.has(slug)) {
		return "mystery-dungeons";
	}

	if (category === "items") {
		const title = entry.title?.[PT_BR] ?? entry.title?.en ?? slug;
		const navigationPath = Array.isArray(entry.navigationPath) ? entry.navigationPath : [];
		const pageKind = entry.pageKind ?? "";
		if (looksLikeDailyMission(title, navigationPath)) return "daily-missions";
		if (looksLikeActualQuestSpoiler(title, navigationPath, pageKind)) return "quests";
		if (looksLikeDimensionalPage(title, navigationPath)) return "dimensional-zone";
		if (looksLikeEventPage(title, navigationPath)) return "events";
		if (looksLikeQuestOrEvent(title, navigationPath, pageKind)) return "systems";
	}

	if (category === "npcs") {
		const title = entry.title?.[PT_BR] ?? entry.title?.en ?? slug;
		const navigationPath = Array.isArray(entry.navigationPath) ? entry.navigationPath : [];
		if (looksLikeDimensionalPage(title, navigationPath)) return "dimensional-zone";
		if (looksLikeActualQuestSpoiler(title, navigationPath, entry.pageKind ?? "")) return "quests";
	}

	return category;
}

export function resolveCategoryLabel(categoryId, fallbackLabel) {
	if (categoryId === "territory-guardians") {
		return {
			"pt-BR": "Guardiões de Território",
			en: "Territory Guardians",
			es: "Guardianes de Territorio",
		};
	}

	if (categoryId === "daily-missions") {
		return {
			"pt-BR": "Missões Diárias",
			en: "Daily Missions",
			es: "Misiones Diarias",
		};
	}

	if (categoryId === "quests") {
		return {
			"pt-BR": "Quests",
			en: "Quests",
			es: "Quests",
		};
	}

	if (categoryId === "events") {
		return {
			"pt-BR": "Eventos",
			en: "Events",
			es: "Eventos",
		};
	}

	if (categoryId === "systems") {
		return {
			"pt-BR": "Sistemas",
			en: "Systems",
			es: "Sistemas",
		};
	}

	if (categoryId === "pokemon") {
		return {
			"pt-BR": "Pokémon",
			en: "Pokemon",
			es: "Pokemon",
		};
	}

	return cleanLocalizedTextMap(fallbackLabel, {
		"pt-BR": categoryId,
		en: categoryId,
		es: categoryId,
	});
}

export function stripCategoryPrefix(title, categoryLabel) {
	const cleanTitle = cleanDisplayText(title);
	const cleanCategory = cleanDisplayText(categoryLabel);
	if (!cleanTitle || !cleanCategory) return cleanTitle;
	for (const separator of [" - ", " – ", ": "]) {
		const prefix = `${cleanCategory}${separator}`;
		if (cleanTitle.toLowerCase().startsWith(prefix.toLowerCase())) {
			return cleanTitle.slice(prefix.length).trim();
		}
	}

	return cleanTitle;
}

export function resolveDisplayTitle(titleMap, categoryLabelMap) {
	const categoryLabel = categoryLabelMap?.[PT_BR] ?? "";
	const title = Object.fromEntries(
		Object.entries(titleMap ?? {}).map(([locale, value]) => [
			locale,
			stripCategoryPrefix(value, categoryLabelMap?.[locale] ?? categoryLabelMap?.[PT_BR] ?? ""),
		])
	);
	if (cleanDisplayText(categoryLabel) === "Mystery Dungeons") {
		return Object.fromEntries(
			Object.entries(title).map(([locale, value]) => [
				locale,
				cleanDisplayText(value).replace(/^Mystery Dungeon\s*[-–:]\s*/i, ""),
			])
		);
	}

	return title;
}

const PROFESSION_ROOT_SLUGS = new Set([
	"aventureiro",
	"engenheiro",
	"estilista",
	"professor",
]);

function professionTitleOverride(slug) {
	if (slug === "aventureiro") return localizedGroup("Aventureiro", "Adventurer", "Aventurero");
	if (slug === "engenheiro") return localizedGroup("Engenheiro", "Engineer", "Ingeniero");
	if (slug === "estilista") return localizedGroup("Estilista", "Stylist", "Estilista");
	if (slug === "professor") return localizedGroup("Professor", "Professor", "Profesor");
	return null;
}

export function resolveTitleOverride({ category, slug }) {
	if (category === "professions") return professionTitleOverride(slug);
	return null;
}

export function resolveDisplayInList({ category, slug, title, pageKind, navigationPath = [] }) {
	const titleText = title?.[PT_BR] ?? title?.en ?? slug;
	if (isTranslatedVariantTitle(titleText)) return false;

	if (category === "professions") {
		return PROFESSION_ROOT_SLUGS.has(slug);
	}

	if (category === "dimensional-zone" && slug !== "dimensional-zone") {
		return DIMENSIONAL_DIFFICULTY_SLUGS.has(slug);
	}

	if (category === "embedded-tower" && slug !== "embedded-tower") {
		return EMBEDDED_TOWER_TOP_LEVEL_SLUGS.has(slug);
	}

	if (category === "territory-guardians" && slug !== "guardioes-de-territorio") {
		return TERRITORY_GUARDIAN_BOSS_SLUGS.has(slug);
	}

	if (category === "quests" && slug !== "quests") {
		return looksLikeActualQuestSpoiler(titleText, navigationPath, pageKind);
	}

	if (category === "npcs" && slug !== "npcs") {
		return pageKind === "npc" && !looksLikeNonNpcPage(titleText, navigationPath);
	}

	return true;
}

export function resolvePageGroup({ category, slug, title, navigationPath = [] }) {
	if (category !== "nightmare-rifts") return null;

	const text = normalizeCategoryText(`${slug} ${title?.[PT_BR] ?? title?.en ?? ""} ${navigationPath.join(" ")}`);
	if (/craft|profissao|profession|arqueolog|archeolog|cozinheir|cook|food|comida/.test(text)) {
		return localizedGroup("Rifts de Crafting", "Crafting Rifts", "Rifts de Crafting");
	}
	if (/weekly|semanal/.test(text)) {
		return localizedGroup("Rifts Semanais", "Weekly Rifts", "Rifts Semanales");
	}
	if (/drop|dropped|saque/.test(text)) {
		return localizedGroup("Rifts de Drop", "Dropped Rifts", "Rifts de Drop");
	}
	if (/mystic|mistico|mistica|mitico|mitica/.test(text)) {
		return localizedGroup("Rifts Místicos", "Mystic Rifts", "Rifts Místicos");
	}
	if (/\b3\b|three|tres|trio|players?|jogadores/.test(text)) {
		return localizedGroup("Rifts de 3 Jogadores", "3 Player Rifts", "Rifts de 3 Jugadores");
	}

	return localizedGroup("Outros Rifts", "Other Rifts", "Otros Rifts");
}

export function resolveSortRank({ category, slug, title }) {
	const text = normalizeCategoryText(`${slug} ${title?.[PT_BR] ?? title?.en ?? ""}`);
	if (category === "embedded-tower") {
		if (/funcionamento|how embedded tower works/.test(text)) return 10;
		if (/primeiro-ao-quarto|primeiro ao quarto|first.*fourth/.test(text)) return 20;
		if (/quinto|fifth/.test(text)) return 30;
		if (/camara|jirachi/.test(text)) return 40;
		if (/setimo|seventh|septimo/.test(text)) return 50;
		if (/wes\s+quest/.test(text)) return 60;
		return 100;
	}

	if (category === "dimensional-zone") {
		if (/bronze/.test(text)) return 10;
		if (/silver|prata/.test(text)) return 20;
		if (/gold|golden|ouro/.test(text)) return 30;
		if (/crystal|cristal/.test(text)) return 40;
		if (/master/.test(text)) return 50;
		return 100;
	}

	if (category === "territory-guardians") {
		if (/dorabelle/.test(text)) return 10;
		if (/tyranitar|darkness/.test(text)) return 20;
		if (/dragonair|celestial/.test(text)) return 30;
		if (/mamoswine|below-zero|below zero/.test(text)) return 40;
		if (/magcargo|magma/.test(text)) return 50;
		return 100;
	}

	if (category === "professions") {
		if (/aventureiro|adventurer/.test(text)) return 10;
		if (/engenheiro|engineer/.test(text)) return 20;
		if (/estilista|stylist/.test(text)) return 30;
		if (/professor/.test(text)) return 40;
		return 100;
	}

	if (category === "nightmare-rifts") {
		const group = resolvePageGroup({ category, slug, title });
		const groupText = normalizeCategoryText(group?.[PT_BR] ?? "");
		if (/crafting/.test(groupText)) return 10;
		if (/semanais|weekly/.test(groupText)) return 20;
		if (/drop|dropped/.test(groupText)) return 30;
		if (/misticos|mystic/.test(groupText)) return 40;
		if (/3/.test(groupText)) return 50;
		return 100;
	}

	return null;
}

export function normalizeSections(sectionsBase) {
	return sectionsBase.map((section) => {
		const paragraphs = section.paragraphs?.[PT_BR] || [];
		const items = section.items?.[PT_BR] || [];
		const media = section.media?.[PT_BR] || [];
		return structureSection({
			...section,
			heading: mirrorLocalizedText(section.heading?.[PT_BR] || ""),
			paragraphs: {
				[PT_BR]: paragraphs.map(cleanDisplayText),
				en: paragraphs.map(cleanDisplayText),
				es: paragraphs.map(cleanDisplayText),
			},
			items: {
				[PT_BR]: items.map(cleanDisplayText),
				en: items.map(cleanDisplayText),
				es: items.map(cleanDisplayText),
			},
			media: {
				[PT_BR]: media,
				en: media,
				es: media,
			},
		});
	});
}

export function buildLocalizedSummary(summary, fallbackValue = "") {
	const rawValue = cleanDisplayText(summary?.[PT_BR] || "");
	const fallback = cleanDisplayText(fallbackValue);
	const normalizedRaw = normalizeCategoryText(rawValue);
	const baseValue = /^conteudo local sincronizado da wiki\.?$/.test(normalizedRaw)
		? fallback
		: rawValue || fallback;
	return {
		[PT_BR]: baseValue,
		en: baseValue,
		es: baseValue,
	};
}
