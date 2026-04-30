import { PT_BR, decodeHtmlEntities, normalizeWhitespace } from "./shared.mjs";
import { publishSection, structureSection } from "./transform.mjs";

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

	if (categoryId === "dimensional-zone") {
		return {
			"pt-BR": "Dimensional Zone",
			en: "Dimensional Zone",
			es: "Dimensional Zone",
		};
	}

	if (categoryId === "quests") {
		return {
			"pt-BR": "Quests",
			en: "Quests",
			es: "Quests",
		};
	}

	if (categoryId === "held-items") {
		return {
			"pt-BR": "Held Itens",
			en: "Held Items",
			es: "Held Items",
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
	if (category === "boss-fight" && slug === "boss-fight") return false;

	if (category === "boss-fight" && pageKind === "index" && slug !== "boss-fight") {
		return false;
	}

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

export function normalizeSections(sectionsBase, pageContext = {}) {
	return sectionsBase.flatMap((section) => {
		const sectionId = cleanDisplayText(section.id ?? "");
		const normalizedSectionId = normalizeCategoryText(sectionId);
		const normalizedHeading = normalizeCategoryText(section.heading?.[PT_BR] ?? "");
		if (normalizedSectionId === "indice" || normalizedHeading === "indice") return [];

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

		const normalizedParagraphs = uniqueText(paragraphs);
		const normalizedItems = uniqueText(items);
		const normalizedMedia = uniqueMedia(media);
		const trapItems = normalizedItems.filter(isTrapItemText);
		const trapMedia = normalizedMedia.filter(isTrapMedia);
		const shouldSplitTraps = normalizedSectionId !== "armadilhas" && (trapItems.length || trapMedia.length);
		const baseItems = shouldSplitTraps ? normalizedItems.filter((item) => !isTrapItemText(item)) : normalizedItems;
		const baseMedia = shouldSplitTraps ? normalizedMedia.filter((item) => !isTrapMedia(item)) : normalizedMedia;
		const normalizedSection = publishSection(structureSection({
			...section,
			pageCategory: pageContext.category,
			pageSlug: pageContext.slug,
			pageKind: pageContext.pageKind,
			heading: mirrorLocalizedText(section.heading?.[PT_BR] || ""),
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
			return [normalizedSection];
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
		];
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
