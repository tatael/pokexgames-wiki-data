import { PT_BR, decodeHtmlEntities, normalizeWhitespace } from "./shared.mjs";
import { publishSection, structureSection } from "./transform.mjs";
import { cleanStructuredText, repairMojibake } from "./transform/text.mjs";

export function cleanDisplayText(value) {
	const text = repairMojibake(String(value ?? ""));

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
]);

const TERRITORY_GUARDIAN_BOSS_SLUGS = new Set([
	"dorabelle",
	"giant-tyranitar",
	"giant-dragonair",
	"giant-mamoswine",
	"giant-magcargo",
]);

const DIMENSIONAL_EVENT_DUNGEON_SLUGS = new Set([
	"dz-queen-s-hive",
	"dz-flower-s-garden",
]);

const NIGHTMARE_WORLD_TOP_LEVEL_SLUGS = new Set([
	"nightmare-world",
	"nightmare-hunts",
	"nightmare-transportes",
	"nightmare-disk",
	"nightmare-brotherhood",
	"nightmare-crystal",
	"subject-14",
	"sistema-de-pokemon-t1h",
]);

const ULTRA_LAB_TOP_LEVEL_SLUG_PATTERNS = [
	/^ultra-lab$/,
	/^advanced-ultra-lab-/,
	/^ultra-lab-alpha-/,
	/^golden-gauntlet$/,
	/^nightmare-chests$/,
	/^nightmare-pokegear$/,
	/^npc-sidis-s-3$/,
	/^sarkies-quest$/,
	/^the-duke-resistance$/,
];

function normalizeCategoryText(value) {
	return cleanDisplayText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

function stripMediaFileTitle(value) {
	return cleanDisplayText(value)
		.replace(/(?:\.|\s+)(?:gif|png|jpe?g|webp|svg)$/i, "")
		.replace(/^\d{1,4}\s*[-_.]\s*/g, "")
		.replace(/^banner\s+(?:bolinha\s+)?(?:bf|md)?\s*/i, "")
		.replace(/^bf(?=[A-Z])/i, "")
		.replace(/^bf\s*/i, "")
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function cleanTitleValue(value) {
	const text = cleanDisplayText(value);
	return /(?:\.|\s+)(?:gif|png|jpe?g|webp|svg)$/i.test(text) ? stripMediaFileTitle(text) : text;
}

function looksLikeDailyMission(title, navigationPath = []) {
	const text = normalizeCategoryText(`${title} ${navigationPath.join(" ")}`);
	return /\bdaily\s+(kill|catch|dz|gift)\b/.test(text)
		|| /\bmissoes?\s+diarias?\b/.test(text);
}

function looksLikeActualQuestSpoiler(title, navigationPath = [], pageKind = "") {
	const titleOnly = normalizeCategoryText(title);
	if (/\bquest\b/.test(titleOnly) && !/\b(item|items|itens|bag|bags|backpack|box|camera|coin|coins?|stone|ticket|token|rewards?)\b/.test(titleOnly)) {
		return true;
	}

	const text = normalizeCategoryText(`${title} ${navigationPath.join(" ")} ${pageKind}`);
	if (!/\bquest\b/.test(text) && !/\bspoilers?\b/.test(text)) return false;
	return !/\b(item|items|itens|bag|bags|backpack|box|camera|coin|coins?|stone|ticket|token|rewards?)\b/.test(text);
}

function looksLikeDimensionalPage(title, navigationPath = []) {
	const text = normalizeCategoryText(`${title} ${navigationPath.join(" ")}`);
	return /\bdz\b|\bdimensional\b|\bqueen s hive\b|\bflower s garden\b/.test(text);
}

function looksLikeEventPage(title, navigationPath = []) {
	const text = normalizeCategoryText(`${title} ${navigationPath.join(" ")}`);
	return /\beventos?\b|\bevents?\b|\bdefender\b|\bchristmas\b|\bnatal\b|\beaster\b|\bpascoa\b|\bhalloween\b|\banniversary\b|\baniversario\b|\bsummer\b|\bvalentine\b|\bnamorados\b|\bpokepark\b|\bpoke\s+park\b/.test(text);
}

function looksLikeItemNoise(title, navigationPath = [], slug = "") {
	const text = normalizeCategoryText(`${slug} ${title} ${navigationPath.join(" ")}`);
	return /\b(backpack|bag|mochila|coin|coins?|camera|cam|token|ticket|box|capsule|stone|ore|gem|ball|cake cam)\b/.test(text);
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

	if (/^dz-/.test(String(slug ?? ""))) {
		return "dimensional-zone";
	}

	if (slug === "wes-quest") {
		return "quests";
	}

	if (PROFESSION_SPECIALIZATION_SLUGS.has(slug)) {
		return "professions";
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
		if (DIMENSIONAL_EVENT_DUNGEON_SLUGS.has(slug)) return "dimensional-zone";
		if (looksLikeDimensionalPage(title, navigationPath)) return "dimensional-zone";
		if (looksLikeEventPage(title, navigationPath)) return "events";
	}

	if (category === "systems") {
		const title = entry.title?.[PT_BR] ?? entry.title?.en ?? slug;
		const navigationPath = Array.isArray(entry.navigationPath) ? entry.navigationPath : [];
		if (looksLikeEventPage(title, navigationPath)) return "events";
	}

	if (category === "events" && DIMENSIONAL_EVENT_DUNGEON_SLUGS.has(slug)) {
		return "dimensional-zone";
	}

	if (category === "events") {
		const title = entry.title?.[PT_BR] ?? entry.title?.en ?? slug;
		const navigationPath = Array.isArray(entry.navigationPath) ? entry.navigationPath : [];
		if (looksLikeItemNoise(title, navigationPath, slug)) return "items";
	}

	if (category === "npcs") {
		const title = entry.title?.[PT_BR] ?? entry.title?.en ?? slug;
		const navigationPath = Array.isArray(entry.navigationPath) ? entry.navigationPath : [];
		if (looksLikeDimensionalPage(title, navigationPath)) return "dimensional-zone";
		if (looksLikeActualQuestSpoiler(title, navigationPath, entry.pageKind ?? "")) return "quests";
	}

	return category;
}

function hasPokemonFormToken(source, token) {
	return new RegExp(`(?:^|\\s)${token}(?:\\s|$)`).test(source);
}

export function resolvePokemonForms({ slug, title, profile, pageKind }) {
	if (pageKind !== "pokemon" && !profile) return null;

	const profileNames = Object.values(profile ?? {})
		.map((entry) => entry?.name)
		.filter(Boolean);
	const source = normalizeCategoryText([
		slug,
		...Object.values(title ?? {}),
		...profileNames,
	].join(" ")).replace(/[-_]+/g, " ");
	const forms = [];
	if (hasPokemonFormToken(source, "shiny")) forms.push("shiny");
	if (hasPokemonFormToken(source, "mega")) forms.push("mega");
	return forms.length ? forms : ["regular"];
}

// Every category needs all three languages. The old chain covered a handful and let the
// rest fall through to `fallbackLabel`, which is the label of whichever page happened to
// come first in that category — that is how `professions` ended up labelled "Nightmare
// Rifts". Proper nouns the game does not translate ("Dimensional Zone") repeat on purpose.
const CATEGORY_LABELS = new Map([
	["boss-fight", { "pt-BR": "Boss Fight", en: "Boss Fight", es: "Boss Fight" }],
	["clans", { "pt-BR": "Clãs", en: "Clans", es: "Clanes" }],
	["daily-missions", { "pt-BR": "Missões Diárias", en: "Daily Missions", es: "Misiones Diarias" }],
	["dimensional-zone", { "pt-BR": "Dimensional Zone", en: "Dimensional Zone", es: "Dimensional Zone" }],
	["embedded-tower", { "pt-BR": "Embedded Tower", en: "Embedded Tower", es: "Embedded Tower" }],
	["events", { "pt-BR": "Eventos", en: "Events", es: "Eventos" }],
	["held-items", { "pt-BR": "Held Itens", en: "Held Items", es: "Held Items" }],
	["items", { "pt-BR": "Itens", en: "Items", es: "Objetos" }],
	["mystery-dungeons", { "pt-BR": "Mystery Dungeons", en: "Mystery Dungeons", es: "Mystery Dungeons" }],
	["nightmare-rifts", { "pt-BR": "Nightmare Rifts", en: "Nightmare Rifts", es: "Nightmare Rifts" }],
	["nightmare-world", { "pt-BR": "Nightmare World", en: "Nightmare World", es: "Nightmare World" }],
	["npcs", { "pt-BR": "NPCs", en: "NPCs", es: "NPCs" }],
	["pokemon", { "pt-BR": "Pokémon", en: "Pokemon", es: "Pokemon" }],
	["professions", { "pt-BR": "Profissões", en: "Professions", es: "Profesiones" }],
	["quests", { "pt-BR": "Quests", en: "Quests", es: "Quests" }],
	["secret-lab", { "pt-BR": "Secret Lab", en: "Secret Lab", es: "Secret Lab" }],
	["systems", { "pt-BR": "Sistemas", en: "Systems", es: "Sistemas" }],
	["tasks", { "pt-BR": "Tasks", en: "Tasks", es: "Tasks" }],
	["territory-guardians", { "pt-BR": "Guardiões de Território", en: "Territory Guardians", es: "Guardianes de Territorio" }],
	["tools", { "pt-BR": "Ferramentas", en: "Tools", es: "Herramientas" }],
	["ultra-lab", { "pt-BR": "Ultra Lab", en: "Ultra Lab", es: "Ultra Lab" }],
]);

export function resolveCategoryLabel(categoryId, fallbackLabel) {
	const known = CATEGORY_LABELS.get(categoryId);
	if (known) return { ...known };

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
			stripCategoryPrefix(cleanTitleValue(value), categoryLabelMap?.[locale] ?? categoryLabelMap?.[PT_BR] ?? ""),
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

	if (cleanDisplayText(categoryLabel) === "Ultra Lab") {
		return Object.fromEntries(
			Object.entries(title).map(([locale, value]) => {
				const cleanValue = cleanDisplayText(value);
				const clanMatch = cleanValue.match(/^Advanced Ultra Lab\s*[-:]\s*(.+)$/i);
				return [locale, clanMatch ? `Laboratório ${clanMatch[1].trim()}` : cleanValue];
			})
		);
	}

	if (cleanDisplayText(categoryLabel) === "Boss Fight") {
		return Object.fromEntries(
			Object.entries(title).map(([locale, value]) => [
				locale,
				cleanDisplayText(value).replace(/^Nightmare Terror\s*[-â€“:]\s*/i, ""),
			])
		);
	}

	if (cleanDisplayText(categoryLabel) === "Quests") {
		return Object.fromEntries(
			Object.entries(title).map(([locale, value]) => [
				locale,
				cleanDisplayText(value).replace(/^Banner\s+/i, ""),
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

const PROFESSION_SPECIALIZATION_SLUGS = new Set([
	"arqueologo",
	"cozinheiro",
]);

function professionTitleOverride(slug) {
	if (slug === "aventureiro") return localizedGroup("Aventureiro", "Adventurer", "Aventurero");
	if (slug === "engenheiro") return localizedGroup("Engenheiro", "Engineer", "Ingeniero");
	if (slug === "estilista") return localizedGroup("Estilista", "Stylist", "Estilista");
	if (slug === "professor") return localizedGroup("Professor", "Professor", "Profesor");
	return null;
}

export function resolveTitleOverride({ category, slug }) {
	if (slug === "experience") return localizedGroup("Experiência", "Experience", "Experiencia");
	if (category === "professions") return professionTitleOverride(slug);
	if (category === "tasks" && slug === "tasks") return localizedGroup("Kanto Tasks", "Kanto Tasks", "Kanto Tasks");
	if (category === "held-items" && slug === "held-itens") return localizedGroup("Tipos de Held Itens", "Held Item Types", "Tipos de Held Items");
	if (category === "embedded-tower" && slug === "funcionamento-da-embedded-tower") return localizedGroup("Como Funciona", "How It Works", "Cómo Funciona");
	return null;
}

export function resolveDisplayInList({ category, slug, title, pageKind, navigationPath = [] }) {
	const titleText = title?.[PT_BR] ?? title?.en ?? slug;
	const normalizedText = normalizeCategoryText(`${slug} ${titleText} ${navigationPath.join(" ")} ${pageKind ?? ""}`);
	if (isTranslatedVariantTitle(titleText)) return false;
	if (category === "events" && slug === "pokepark-pontuacao") return false;
	if (category === "boss-fight" && slug === "boss-fight") return false;

	if (category === "boss-fight" && pageKind === "index" && slug !== "boss-fight") {
		return false;
	}

	if (category === "professions") {
		return PROFESSION_ROOT_SLUGS.has(slug);
	}

	if (category === "dimensional-zone" && slug !== "dimensional-zone") {
		if (/^dz-/.test(String(slug ?? ""))) return true;
		return DIMENSIONAL_DIFFICULTY_SLUGS.has(slug);
	}

	if (category === "embedded-tower" && slug !== "embedded-tower") {
		return EMBEDDED_TOWER_TOP_LEVEL_SLUGS.has(slug);
	}

	if (category === "territory-guardians" && slug !== "guardioes-de-territorio") {
		return TERRITORY_GUARDIAN_BOSS_SLUGS.has(slug);
	}

	if (category === "nightmare-world") {
		return NIGHTMARE_WORLD_TOP_LEVEL_SLUGS.has(slug);
	}

	if (category === "ultra-lab") {
		return ULTRA_LAB_TOP_LEVEL_SLUG_PATTERNS.some((pattern) => pattern.test(slug));
	}

	if (category === "events" && slug !== "events") {
		return looksLikeEventPage(titleText, navigationPath)
			&& !looksLikeItemNoise(titleText, navigationPath, slug);
	}

	if (category === "nightmare-rifts" && slug !== "nightmare-rifts") {
		if (/\b(arqueologo|archeologist|cocinero|cozinheiro|cook|cooks?|comidas?|food|profissao|profession|crafts?|workshops?|recursos?|resource|dungeons?)\b/.test(normalizedText)) return false;
		return /\brift/.test(normalizedText)
			&& !/\b(profissao|profession|arqueologo|archeologist|cozinheiro|cook|cooks?|food|comida|comidas|minigame|item|itens|workshop|resource|recursos)\b/.test(normalizedText);
	}

	if (category === "quests" && slug !== "quests") {
		if (slug === "wes-quest") return true;
		if (Array.isArray(navigationPath) && navigationPath.length > 3) return false;
		return pageKind === "quest" || looksLikeActualQuestSpoiler(titleText, navigationPath, pageKind);
	}

	if (category === "npcs" && slug !== "npcs") {
		return pageKind === "npc" && !looksLikeNonNpcPage(titleText, navigationPath);
	}

	return true;
}

export function resolvePageGroup({ category, slug, title, navigationPath = [] }) {
	if (category === "items") {
		const text = normalizeCategoryText(`${slug} ${title?.[PT_BR] ?? title?.en ?? ""} ${navigationPath.join(" ")}`);
		if (/\b(capsule|capsula|pokeball|poke ball|ball|balls)\b/.test(text)) return localizedGroup("Cápsulas e balls", "Capsules and balls", "Cápsulas y balls");
		if (/\b(camera|cameras|cam|tv camera|figure|figures)\b/.test(text)) return localizedGroup("Câmeras e decorações", "Cameras and decorations", "Cámaras y decoraciones");
		if (/\b(elixir|elixirs?)\b/.test(text)) return localizedGroup("Elixirs", "Elixirs", "Elixirs");
		if (/\b(stone|pedra|evolution|evolucao)\b/.test(text)) return localizedGroup("Pedras", "Stones", "Piedras");
		if (/\b(profissao|profession|craft|alquimista|adventurer|aventureiro|engineer|engenheiro|stylist|estilista|ore|ingot|wool|fur|feather|wood|seed|fragment|fragmento|shard|essence|thread|fabric|cloth|leather|recipe|receita)\b/.test(text)) return localizedGroup("Itens de profissão", "Profession items", "Items de profesión");
		if (/\b(backpack|bag|mochila|mochilas)\b/.test(text)) return localizedGroup("Mochilas", "Backpacks", "Mochilas");
		if (/\b(coin|coins?|token|ticket|currency|moeda|gem|gems?)\b/.test(text)) return localizedGroup("Moedas e tokens", "Coins and tokens", "Monedas y tokens");
		if (/\b(outfit|addon|clothes|roupa)\b/.test(text)) return localizedGroup("Outfits", "Outfits", "Outfits");
		return localizedGroup("Outros", "Other", "Otros");
	}

	if (category === "boss-fight") {
		const text = normalizeCategoryText(`${slug} ${title?.[PT_BR] ?? title?.en ?? ""} ${navigationPath.join(" ")}`);
		if (/\b(king charizard|bowstoise|bowtoise)\b/.test(text)) {
			return localizedGroup("Eventos", "Events", "Eventos");
		}

		if (/\b(lavender|ghost|tentacruel)\b/.test(text)) {
			return localizedGroup("Outros", "Other", "Otros");
		}

		if (/\b(entei|raikou|suicune|bestas lendarias|caes lendarios|legendary beasts)\b/.test(text)) {
			return localizedGroup("Cães Lendários", "Legendary Dogs", "Perros Legendarios");
		}

		if (/\bnightmare terror\b/.test(text)) {
			return localizedGroup("Nightmare Terror", "Nightmare Terror", "Nightmare Terror");
		}

		if (/\b(evento|eventos|event|events|lavender s curse|lavender curse)\b/.test(text)) {
			return localizedGroup("Eventos", "Events", "Eventos");
		}

		return localizedGroup("Outros", "Other", "Otros");
	}

	if (category !== "nightmare-rifts") return null;

	const text = normalizeCategoryText(`${slug} ${title?.[PT_BR] ?? title?.en ?? ""} ${navigationPath.join(" ")}`);
	if (/craft|profissao|profession|arqueolog|archeolog|cozinheir|cook|food|comida/.test(text)) {
		return localizedGroup("Craft", "Craft", "Craft");
	}

	if (/weekly|semanal/.test(text)) {
		return localizedGroup("Rifts Semanais", "Weekly Rifts", "Rifts Semanales");
	}

	if (/drop|dropped|saque/.test(text)) {
		return localizedGroup("Rifts de Drop", "Dropped Rifts", "Rifts de Drop");
	}

	if (/mystic|mistico|mistica|mitico|mitica/.test(text)) {
		return localizedGroup("Mítica", "Mystic", "Mítica");
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
		if (/craft|crafting/.test(groupText)) return 10;
		if (/semanais|weekly/.test(groupText)) return 20;
		if (/drop|dropped/.test(groupText)) return 30;
		if (/misticos|mystic/.test(groupText)) return 40;
		if (/3/.test(groupText)) return 50;
		return 100;
	}

	return null;
}

function isTrapItemText(value) {
	return /\btrap[\w\s-]*\.(?:gif|png|webp|jpe?g)\b/i.test(String(value ?? ""));
}

function isTrapMedia(item) {
	return isTrapItemText(String(item?.alt ?? "") + " " + String(item?.url ?? "") + " " + String(item?.slug ?? ""));
}

function withBossShinyGiantTentacruelLeadSections(sectionsBase, pageContext) {
	if (pageContext.slug !== "boss-shiny-giant-tentacruel") return sectionsBase;
	const leadRewardItems = [
		"Emerald loot bag.png | Emerald Loot Bag",
		"10.000 Carat Emerald",
		"Giant Fang | Giant Fang",
		"Shiny Tentacruel tentacle..png | Shiny Tentacruel Tentacle",
		"Water-stone.gif | Water Stone",
		"Venom-stone.gif | Venom Stone",
	];

	const sections = sectionsBase.map((section) => {
		if (normalizeCategoryText(section.id ?? "") !== "recompensas") return section;
		const currentItems = (section.items?.[PT_BR] ?? [])
			.filter((item) => !/\bcarat emerald\b/.test(normalizeCategoryText(item)));
		const currentKeys = new Set(currentItems.map(normalizeCategoryText));
		const missingItems = leadRewardItems.filter((item) => !currentKeys.has(normalizeCategoryText(item)));
		if (!missingItems.length) return section;
		return {
			...section,
			items: {
				...(section.items ?? {}),
				[PT_BR]: [...missingItems, ...currentItems],
			},
		};
	});

	const hasRequirements = sections.some((section) => normalizeCategoryText(section.id ?? "") === "requisitos");
	if (hasRequirements) return sections;
	const section = {
		id: "requisitos",
		heading: { [PT_BR]: "Requisitos" },
		paragraphs: {
			[PT_BR]: ["Ter concluído a nave (parte da The Chosen One Quest)."],
		},
		items: { [PT_BR]: [] },
		media: { [PT_BR]: [] },
	};

	return [section, ...sections];
}

const QUEST_ENCOUNTER_HEADING_RE = /^(?:primeiro|segundo|terceiro|quarto|quinto|sexto|s[eé]timo|oitavo|nono|d[eé]cimo)\s+encontro\b/i;
const QUEST_FIRST_CHALLENGE_HINT_RE = /(?:no\s+primeiro\s+desafio|primeiro\s+desafio|primeiro\s+encontro|n[ií]vel\s+necess[áa]rio\s*:?)/i;
const QUEST_REWARD_ROW_RE = /^\s*(?:exp\s+icon(?:\s+nw)?|[^|]+?\.(?:png|gif|webp|jpe?g|svg))\s*\|/i;
const QUEST_FLAT_REWARD_LINE_RE = /^(?:\d{1,3}(?:[.,]\d{3})+|\d+)\s*[kKmM]?\s+[A-Za-zÀ-ÿ]/;

function isQuestRewardRowItem(item) {
	return typeof item === "string" && QUEST_REWARD_ROW_RE.test(item);
}

function isQuestFlatRewardLine(text) {
	const value = String(text ?? "").trim();
	if (!value) return false;
	return QUEST_FLAT_REWARD_LINE_RE.test(value);
}

function synthesizePrimeiroEncontroSection(sections = [], pageContext = {}) {
	if (pageContext?.category !== "quests") return sections;
	if (!Array.isArray(sections) || sections.length < 2) return sections;

	const introIdx = sections.findIndex((section) => normalizeCategoryText(section?.id ?? "") === "introducao");
	if (introIdx < 0) return sections;
	const intro = sections[introIdx];
	if (!intro) return sections;

	const hasEncounterSibling = sections.some((section, idx) => {
		if (idx === introIdx) return false;
		return QUEST_ENCOUNTER_HEADING_RE.test(String(section?.heading?.[PT_BR] ?? "").trim());
	});
	if (!hasEncounterSibling) return sections;

	const alreadyHasPrimeiro = sections.some((section) => {
		if (normalizeCategoryText(section?.id ?? "") === "primeiro-encontro") return true;
		return /^primeiro\s+encontro\b/i.test(String(section?.heading?.[PT_BR] ?? "").trim());
	});
	if (alreadyHasPrimeiro) return sections;

	const introParagraphs = intro.paragraphs?.[PT_BR] ?? [];
	const introItems = intro.items?.[PT_BR] ?? [];
	const challengeStartIdx = introParagraphs.findIndex((line) => QUEST_FIRST_CHALLENGE_HINT_RE.test(String(line ?? "")));
	const hasRewardRow = introItems.some(isQuestRewardRowItem);
	if (challengeStartIdx < 0 && !hasRewardRow) return sections;

	const stayParagraphs = challengeStartIdx >= 0 ? introParagraphs.slice(0, challengeStartIdx) : introParagraphs;
	const moveParagraphsRaw = challengeStartIdx >= 0 ? introParagraphs.slice(challengeStartIdx) : [];
	const moveParagraphs = moveParagraphsRaw.filter((line) => !isQuestFlatRewardLine(line));
	const stayItems = introItems.filter((item) => !isQuestRewardRowItem(item));
	const moveItems = introItems.filter((item) => isQuestRewardRowItem(item));

	if (!moveParagraphs.length && !moveItems.length) return sections;

	const updatedIntro = {
		...intro,
		paragraphs: { [PT_BR]: stayParagraphs, en: stayParagraphs, es: stayParagraphs },
		items: { [PT_BR]: stayItems, en: stayItems, es: stayItems },
	};

	const primeiroEncontro = {
		id: "primeiro-encontro",
		heading: { [PT_BR]: "Primeiro encontro", en: "Primeiro encontro", es: "Primeiro encontro" },
		paragraphs: { [PT_BR]: moveParagraphs, en: moveParagraphs, es: moveParagraphs },
		items: { [PT_BR]: moveItems, en: moveItems, es: moveItems },
		media: { [PT_BR]: [], en: [], es: [] },
	};

	const next = [...sections];
	next[introIdx] = updatedIntro;
	next.splice(introIdx + 1, 0, primeiroEncontro);
	return next;
}

const PUBLISHED_TYPED_SECTION_KEYS = [
	"facts", "tasks", "taskGroups", "pokemon", "rewards", "profile", "moves", "effectiveness",
	"variants", "abilities", "steps", "locations", "difficulties", "bossSupport", "bossRecommendations",
	"heldEnhancement", "hazards", "dungeonSupport", "heldCategories", "heldBoosts", "heldDetails",
	"questSupport", "questPhases", "combatPokemon", "clanTasks", "embeddedTowerProgression",
	"embeddedTowerUnlocks", "embeddedTowerSupport", "linkedCards", "commerceEntries", "craftEntries",
	"travelNetwork", "boostLookup", "talentTrees", "pokelogEntries",
];

function hasLocalizedEntries(map) {
	return Boolean(map && typeof map === "object" && Object.keys(map).length);
}

// A published section with no content, tables, media, or typed payload renders as an empty card
// and (for quests) trips the "generic-only" validation. Drop it.
function isEmptyPublishedSection(section) {
	if (!section) return true;
	if (hasLocalizedEntries(section.content)) return false;
	if (hasLocalizedEntries(section.tables)) return false;
	if (hasLocalizedEntries(section.media)) return false;
	if (hasLocalizedEntries(section.mediaRefs)) return false;
	return !PUBLISHED_TYPED_SECTION_KEYS.some((key) => hasLocalizedEntries(section[key]));
}

export function normalizeSections(sectionsBase, pageContext = {}) {
	const baseSections = synthesizePrimeiroEncontroSection(sectionsBase, pageContext);
	return withBossShinyGiantTentacruelLeadSections(baseSections, pageContext).flatMap((section) => {
		const sectionId = cleanDisplayText(section.id ?? "");
		const normalizedSectionId = normalizeCategoryText(sectionId);
		const normalizedHeading = normalizeCategoryText(section.heading?.[PT_BR] ?? "");
		if (normalizedSectionId === "indice" || normalizedHeading === "indice") return [];
		if (isNavigationMenuSection(normalizedSectionId, normalizedHeading)) return [];
		if (isTemplatePlaceholderSection(section)) return [];

		const paragraphs = section.paragraphs?.[PT_BR] || [];
		const items = section.items?.[PT_BR] || [];
		const media = section.media?.[PT_BR] || [];
		const shouldKeepText = (value) => {
			const text = cleanDisplayText(value);
			const normalized = normalizeCategoryText(text);
			if (!text) return false;
			return !/document\.addeventlistener|const\s+classicons|const\s+typeicons|function\s+filterhunts|queryselectorall|innerhtml|\.hidden\s*\{|\.image-container|\.tag-button/.test(normalized);
		};

		const uniqueText = (values) => {
			const seen = new Set();
			return values.map(cleanDisplayText).filter((value) => {
				const key = normalizeCategoryText(value);
				if (!shouldKeepText(value) || seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		};

		const uniqueMedia = (values) => {
			if (sectionId === "possiveis-capturas") return values.filter((item) => Boolean(item?.url));
			const seen = new Set();
			return values.filter((item) => {
				const key = item?.url ?? "";
				if (!key || seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		};

		const normalizedMedia = uniqueMedia(media);
		const shouldNormalizeCaptures = isDimensionalZonePage(pageContext) && isPossibleCapturesSection(normalizedSectionId, normalizedHeading);
		const normalizedParagraphs = shouldNormalizeCaptures ? [] : uniqueText(paragraphs);
		const normalizedItems = shouldNormalizeCaptures
			? captureItemsFromMedia(normalizedMedia)
			: uniqueText(items);
		const trapItems = normalizedItems.filter(isTrapItemText);
		const trapMedia = normalizedMedia.filter(isTrapMedia);
		// Only split traps into their own "Armadilhas" section when there is actual trap
		// text (entries with trap gif refs). A lone decorative trap image inside another
		// section (e.g. a boss battle) stays inline, matching the source wiki layout.
		const shouldSplitTraps = normalizedSectionId !== "armadilhas" && trapItems.length > 0;
		const baseItems = shouldSplitTraps ? normalizedItems.filter((item) => !isTrapItemText(item)) : normalizedItems;
		const baseMedia = shouldSplitTraps ? normalizedMedia.filter((item) => !isTrapMedia(item)) : normalizedMedia;
		const normalizedSection = publishSection(structureSection({
			...section,
			pageCategory: pageContext.category,
			pageSlug: pageContext.slug,
			pageKind: pageContext.pageKind,
			id: shouldNormalizeCaptures ? "possiveis-capturas" : section.id,
			heading: mirrorLocalizedText(shouldNormalizeCaptures ? "Possíveis Capturas" : (section.heading?.[PT_BR] || "")),
			paragraphs: {
				[PT_BR]: normalizedParagraphs,
				en: normalizedParagraphs,
				es: normalizedParagraphs,
			},
			items: {
				[PT_BR]: baseItems,
				en: baseItems,
				es: baseItems,
			},
			media: {
				[PT_BR]: baseMedia,
				en: baseMedia,
				es: baseMedia,
			},
		}));

		if (!shouldSplitTraps) {
			return isEmptyPublishedSection(normalizedSection) ? [] : [normalizedSection];
		}

		return [
			normalizedSection,
			publishSection(structureSection({
				id: "armadilhas",
				pageCategory: pageContext.category,
				pageSlug: pageContext.slug,
				pageKind: pageContext.pageKind,
				heading: mirrorLocalizedText("Armadilhas"),
				paragraphs: { [PT_BR]: [], en: [], es: [] },
				items: { [PT_BR]: trapItems, en: trapItems, es: trapItems },
				media: { [PT_BR]: trapMedia, en: trapMedia, es: trapMedia },
			})),
		].filter((entry) => !isEmptyPublishedSection(entry));
	});
}

export function buildLocalizedSummary(summary, fallbackValue = "") {
	const rawValue = cleanSummaryText(summary?.[PT_BR] || "");
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

export function buildLocalizedPageSummary(rawSummary, fallbackValue = "", sections = []) {
	const introParagraph = findIntroductionSummary(sections);
	return buildLocalizedSummary(introParagraph ? { [PT_BR]: introParagraph } : rawSummary, fallbackValue);
}

function findIntroductionSummary(sections = []) {
	const intro = (sections ?? []).find((section) => normalizeCategoryText(section?.id ?? "") === "introducao");
	const paragraphs = intro?.content?.[PT_BR]?.paragraphs
		?? intro?.content?.en?.paragraphs
		?? intro?.content?.es?.paragraphs
		?? [];
	const media = intro?.media?.[PT_BR] ?? intro?.media?.en ?? intro?.media?.es ?? [];
	return stripLeadingMediaCaption(cleanSummaryText(paragraphs.find(Boolean) ?? ""), media);
}

// An intro paragraph often begins with the banner's caption ("Banner Nightmare Crystal
// Nos locais de caça…"), because the image alt is flattened into the text ahead of the
// real sentence. On a category card that caption is all the reader sees, so a leading
// run matching one of the section's own media names is dropped.
function stripLeadingMediaCaption(summary, media = []) {
	let text = String(summary ?? "").trim();
	if (!text) return text;

	const captions = (media ?? [])
		.flatMap((item) => [item?.alt, decodeURIComponent(String(item?.url ?? "").split("/").pop() ?? "")])
		.map((value) => String(value ?? "")
			.replace(/\.(?:png|gif|webp|jpe?g|svg)$/i, "")
			.replace(/[_-]+/g, " ")
			.replace(/\s+/g, " ")
			.trim())
		.filter((value) => value.length >= 3)
		.sort((a, b) => b.length - a.length);

	let changed = true;
	while (changed) {
		changed = false;
		for (const caption of captions) {
			// Only a caption sitting at the very front is noise; the same words later in
			// the sentence are ordinary prose.
			if (!text.toLowerCase().startsWith(caption.toLowerCase())) continue;
			const rest = text.slice(caption.length).replace(/^[\s:–—-]+/, "");
			// Never strip so much that nothing readable is left.
			if (rest.length < 24) continue;
			text = rest;
			changed = true;
			break;
		}
	}

	return text.trim();
}

function cleanSummaryText(value) {
	// Wiki file names are multi-word ("Banner Nightmare Crystal.png"). Consuming only the
	// word immediately before the extension left "Banner Nightmare" stranded at the head
	// of the card summary, so the whole preceding word run goes with it.
	return cleanStructuredText(cleanDisplayText(value)
		.replace(/\b(?:\d{1,4}[-_])?[\p{L}\p{N}_%()'-]+(?:\s+[\p{L}\p{N}_%()'-]+){0,5}\.(?:png|gif|webp|jpe?g|svg)\s*/giu, ""));
}

function isPossibleCapturesSection(normalizedId, normalizedHeading) {
	return normalizedId === "possiveis capturas"
		|| normalizedHeading === "possiveis capturas"
		|| normalizedId === "possiveis catches"
		|| normalizedHeading === "possiveis catches"
		|| normalizedId === "possible captures"
		|| normalizedHeading === "possible captures"
		|| normalizedId === "possible catches"
		|| normalizedHeading === "possible catches";
}

function isPokeballMedia(item) {
	const text = normalizeCategoryText(`${item?.slug ?? ""} ${item?.alt ?? ""} ${item?.url ?? ""}`).replace(/[_-]+/g, " ");
	return /\b(?:poke|pokeball|ball|premier|ultra|sora|tinker|heavy|yume|janguru|net|dusk|great|super|fast|quick|repeat|timer|moon|friend|love|level|lure|luxury|sport|safari)\s*ball\b/.test(text)
		|| /\bball(?:\s|\d|$)/.test(text);
}

function captureNameFromMedia(item) {
	const source = hasVariantSlug(item?.slug) || isNumericMediaName(item?.alt) ? item.slug : (item?.alt ?? item?.slug ?? "");
	const text = cleanDisplayText(source)
		.replace(/\.(?:gif|png|jpe?g|webp|svg)$/i, "")
		.replace(/^\d{1,4}\s*[-_.]\s*/u, "")
		.replace(/[-_]+/g, " ")
		.replace(/^(?:s\.|sh\s+)/i, "Shiny ")
		.replace(/^g\s+/i, "Giant ")
		.trim();
	if (!text) return "";
	return text.split(/\s+/).map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ");
}

function hasVariantSlug(slug = "") {
	return /^(?:shiny|giant|mega|alolan|galarian|hisuian|champion)-/.test(String(slug ?? ""));
}

function isNumericMediaName(value = "") {
	return /^\d{1,4}(?:\.(?:gif|png|jpe?g|webp|svg))?$/i.test(String(value ?? "").trim());
}

function captureItemsFromMedia(media = []) {
	const seen = new Set();
	const captures = [];
	for (const item of media ?? []) {
		if (!item?.url || isPokeballMedia(item)) continue;
		const name = captureNameFromMedia(item);
		const key = normalizeCategoryText(name);
		if (!name || seen.has(key)) continue;
		seen.add(key);
		captures.push(name);
	}

	return captures;
}

function isDimensionalZonePage(pageContext = {}) {
	return pageContext.category === "dimensional-zone" && /^dz-/.test(String(pageContext.slug ?? ""));
}

// A widget's unrendered row template can survive scraping as a normal section — the
// Quests index published a `name` section whose only body was `# {{name}}`, carrying the
// template's dummy cards ("poke ball 1", "nightmare ball") as if they were real links.
// Placeholder syntax in the visible text is the tell; no wiki page writes `{{x}}` as prose.
function isTemplatePlaceholderSection(section) {
	const text = [
		...(section.paragraphs?.[PT_BR] ?? []),
		...(section.items?.[PT_BR] ?? []),
		section.heading?.[PT_BR] ?? "",
	].join(" ");
	return /\{\{\s*[\w.]+\s*\}\}/.test(text);
}

function isNavigationMenuSection(normalizedId, normalizedHeading) {
	return normalizedId === "menu de navegacao"
		|| normalizedHeading === "menu de navegacao"
		|| normalizedId === "navigation menu"
		|| normalizedHeading === "navigation menu";
}
