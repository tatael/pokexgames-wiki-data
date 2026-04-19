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

export function resolveCategory(category, slug, profile) {
	if (category === "boss-fight" && profile && !slug.startsWith("boss-fight-")) {
		return "pokemon";
	}

	return category;
}

export function resolveCategoryLabel(categoryId, fallbackLabel) {
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

export function buildLocalizedSummary(summary) {
	const baseValue = summary?.[PT_BR] || "";
	return {
		[PT_BR]: baseValue,
		en: baseValue,
		es: baseValue,
	};
}

