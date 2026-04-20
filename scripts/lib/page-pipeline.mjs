import { PT_BR } from "./shared.mjs";
import { structureSection } from "./transform.mjs";

export function mirrorLocalizedText(value) {
	return {
		[PT_BR]: value,
		en: value,
		es: value,
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

function normalizeCategoryText(value) {
	return String(value ?? "")
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

export function resolveCategory(category, slug, profile, entry = {}) {
	if (profile) {
		return "pokemon";
	}

	if (GUARDIAN_DUNGEON_SLUGS.has(slug)) {
		return "territory-guardians";
	}

	if (category === "items") {
		const title = entry.title?.[PT_BR] ?? entry.title?.en ?? slug;
		const navigationPath = Array.isArray(entry.navigationPath) ? entry.navigationPath : [];
		const pageKind = entry.pageKind ?? "";
		if (looksLikeDailyMission(title, navigationPath)) return "daily-missions";
		if (looksLikeQuestOrEvent(title, navigationPath, pageKind)) return "quests";
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

	if (categoryId === "pokemon") {
		return {
			"pt-BR": "Pokémon",
			en: "Pokemon",
			es: "Pokemon",
		};
	}

	return fallbackLabel ?? {
		"pt-BR": categoryId,
		en: categoryId,
		es: categoryId,
	};
}

export function stripCategoryPrefix(title, categoryLabel) {
	if (!title || !categoryLabel) return title;
	for (const separator of [" - ", " – ", ": "]) {
		const prefix = `${categoryLabel}${separator}`;
		if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
			return title.slice(prefix.length).trim();
		}
	}

	return title;
}

export function resolveDisplayTitle(titleMap, categoryLabelMap) {
	return Object.fromEntries(
		Object.entries(titleMap ?? {}).map(([locale, value]) => [
			locale,
			stripCategoryPrefix(value, categoryLabelMap?.[locale] ?? categoryLabelMap?.[PT_BR] ?? ""),
		])
	);
}

export function resolveSortRank({ category, slug, title }) {
	const text = normalizeCategoryText(`${slug} ${title?.[PT_BR] ?? title?.en ?? ""}`);
	if (category === "embedded-tower") {
		if (/\bprimeiro\b|\bfirst\b|primer/.test(text)) return 10;
		if (/\bsegundo\b|\bsecond\b/.test(text)) return 20;
		if (/\bterceiro\b|\bthird\b/.test(text)) return 30;
		if (/\bquarto\b|\bfourth\b|cuarto/.test(text)) return 40;
		if (/\bquinto\b|\bfifth\b|quinto/.test(text)) return 50;
		if (/camara|jirachi/.test(text)) return 60;
		if (/\bsexto\b|\bsixth\b|sexto/.test(text)) return 70;
		if (/\bsetimo\b|\bseventh\b|septimo/.test(text)) return 80;
		if (/wes\s+quest/.test(text)) return 90;
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

	return null;
}

export function normalizeSections(sectionsBase) {
	return sectionsBase.map((section) => {
		const paragraphs = section.paragraphs?.[PT_BR] || [];
		const items = section.items?.[PT_BR] || [];
		return structureSection({
			...section,
			heading: mirrorLocalizedText(section.heading?.[PT_BR] || ""),
			paragraphs: {
				[PT_BR]: paragraphs,
				en: paragraphs,
				es: paragraphs,
			},
			items: {
				[PT_BR]: items,
				en: items,
				es: items,
			},
		});
	});
}

export function buildLocalizedSummary(summary, fallbackValue = "") {
	const rawValue = summary?.[PT_BR] || "";
	const baseValue = rawValue === "Conteúdo local sincronizado da wiki."
		? fallbackValue
		: rawValue;
	return {
		[PT_BR]: baseValue,
		en: baseValue,
		es: baseValue,
	};
}
