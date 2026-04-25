import { PT_BR, buildSlug } from "./shared.mjs";
import { cleanStructuredText, dedupeBySlug, normalizeIdToken } from "./transform/text.mjs";
import { classifySectionKind } from "./transform/classification.mjs";
import {
	cleanRawPokemonReferenceItems,
	cleanPokemonGroupItems,
	parseEffectivenessGroupsText,
	parseFactRows,
	parseMoveGroupsText,
	parsePokemonItemText,
	parsePokemonProfileText,
	parseVariantEntryText,
} from "./transform/pokemon.mjs";
import {
	dedupeRewards,
	ensureLegendaryBossRewards,
	fillSparseDifficultyRewards,
	parseRewardItemText,
	propagateDifficulty,
} from "./transform/rewards.mjs";
import { parseTaskSectionPayloads } from "./transform/tasks.mjs";
import { isQuestLocationSection, isQuestStepSection, isQuestSupportSection, parseQuestPhase, parseQuestSupport } from "./transform/quests.mjs";
import { parseClanTaskRanks } from "./transform/clan-tasks.mjs";
import { isCommerceSection, parseCommerceEntries } from "./transform/commerce.mjs";
import {
	isHeldBoostSection,
	isHeldCategoriesSection,
	isHeldDetailsSection,
	parseHeldDetails,
	parseHeldBoostGroups,
	parseHeldCategoryGroups,
	parseHeldOperationSteps,
} from "./transform/held-items.mjs";
import {
	isBossSupportSection,
	isBossRecommendationsSection,
	isDifficultySection as isBossFightDifficultySection,
	isHeldEnhancementSection as isBossFightHeldEnhancementSection,
	parseBossRecommendations,
	parseBossSupport,
	parseDifficultyEntries as parseBossFightDifficultyEntries,
	parseHeldEnhancementEntries as parseBossFightHeldEnhancementEntries,
} from "./transform/boss-fight.mjs";
import {
	isHazardSection as isDungeonHazardSection,
	isDungeonSupportSection,
	parseDungeonSupport,
	parseHazardEntries as parseDungeonHazardEntries,
} from "./transform/dungeons.mjs";
import {
	isEmbeddedTowerLinkedCardsSection,
	isEmbeddedTowerProgressionSection,
	isEmbeddedTowerSupportSection,
	isEmbeddedTowerUnlockSection,
	parseEmbeddedTowerProgression,
	parseEmbeddedTowerSupport,
	parseEmbeddedTowerUnlocks,
	parseLinkedCards,
} from "./transform/embedded-tower.mjs";
import {
	isAbilitySection,
	isLocationSection,
	isStepSection,
	parseHeadingGroupedEntries,
	parseLocationEntries,
	parseStepEntries,
} from "./transform/generic-sections.mjs";
import { publishSection } from "./transform/publish.mjs";

export { stripImageRefFromText } from "./transform/text.mjs";
export { parsePokemonItemText } from "./transform/pokemon.mjs";
export { parseRewardItemText } from "./transform/rewards.mjs";
export { publishSection } from "./transform/publish.mjs";
export { classifySectionKind, isTierSectionToken, SECTION_KIND_BY_ID } from "./transform/classification.mjs";

export function structureSection(section) {
	const id = section.id ?? "";
	const headingText = section.heading?.[PT_BR] ?? "";
	const kind = classifySectionKind(id, headingText);
	const result = { ...section, kind };
	const normalizedId = normalizeIdToken(id);
	const pageCategory = normalizeIdToken(section.pageCategory ?? "");
	const normalizedHeading = normalizeIdToken(headingText);

	if (!["rewards", "tier", "pokemon-group", "tasks"].includes(kind)) {
		result.items = cleanRawPokemonReferenceItems(section.items);
	}

	if (kind === "tier") {
		const pokemon = {};
		for (const locale of Object.keys(section.items ?? {})) {
			pokemon[locale] = (section.items[locale] ?? [])
				.map(parsePokemonItemText)
				.filter(Boolean);
		}

		result.pokemon = pokemon;
	}

	if (kind === "rewards") {
		const rewards = {};
		for (const locale of Object.keys(section.items ?? {})) {
			const parsed = (section.items[locale] ?? [])
				.map(parseRewardItemText)
				.filter(Boolean);
			rewards[locale] = dedupeRewards(fillSparseDifficultyRewards(ensureLegendaryBossRewards(propagateDifficulty(parsed))));
		}

		result.rewards = rewards;
	}

	if (kind === "pokemon-group") {
		const cleanedItems = {};
		const pokemon = {};
		for (const locale of Object.keys(section.items ?? {})) {
			cleanedItems[locale] = cleanPokemonGroupItems(
				section.items[locale] ?? [],
				section.media?.[locale] ?? [],
			);
			const seen = new Set();
			pokemon[locale] = cleanedItems[locale]
				.flatMap((item) => String(item ?? "").split(/\s*\|\s*/))
				.map(cleanStructuredText)
				.filter((name) => {
					if (!name || seen.has(name)) return false;
					seen.add(name);
					return true;
				})
				.map((name) => ({ name, exclusive: false, pve: "Not", pvp: "Not" }));
		}

		result.items = cleanedItems;
		if (Object.values(pokemon).some((entries) => entries.length)) result.pokemon = pokemon;
	}

	if (isBossRecommendationsSection(normalizedId, normalizedHeading, pageCategory)) {
		const bossRecommendations = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const parsed = parseBossRecommendations(
				section.paragraphs?.[locale] ?? [],
				result.items?.[locale] ?? section.items?.[locale] ?? [],
			);
			if (parsed.intro.length || parsed.groups.length) bossRecommendations[locale] = parsed;
		}

		if (Object.keys(bossRecommendations).length) result.bossRecommendations = bossRecommendations;
	}

	if (kind === "tasks") {
		Object.assign(result, parseTaskSectionPayloads(section));
	}

	if (pageCategory === "clans" && /-tasks$/.test(section.pageSlug ?? "")) {
		const clanTasks = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const parsedRanks = parseClanTaskRanks(section.paragraphs?.[locale] ?? [], section.items?.[locale] ?? []);
			if (parsedRanks.length) clanTasks[locale] = { ranks: parsedRanks };
		}

		if (Object.keys(clanTasks).length) result.clanTasks = clanTasks;
	}

	const facts = {};
	for (const locale of new Set([
		...Object.keys(section.paragraphs ?? {}),
		...Object.keys(section.items ?? {})
	])) {
		const rows = parseFactRows([...(section.paragraphs?.[locale] ?? []), ...(section.items?.[locale] ?? [])]);
		if (rows.length >= 2) facts[locale] = rows;
	}

	if (Object.keys(facts).length) result.facts = facts;

	if (normalizedId === "informacoes gerais") {
		const profile = {};
		for (const locale of Object.keys(section.paragraphs ?? {})) {
			const paragraphs = section.paragraphs?.[locale] ?? [];
			const structured = parsePokemonProfileText(paragraphs.join(" "));
			if (structured) profile[locale] = structured;
		}

		if (Object.keys(profile).length) result.profile = profile;
	}

	if (normalizedId === "movimentos" || normalizedId.startsWith("movimentos ")) {
		const moves = {};
		for (const locale of Object.keys(section.items ?? {})) {
			const paragraphs = section.paragraphs?.[locale] ?? [];
			const items = section.items?.[locale] ?? [];
			const sectionLabel = section.heading?.[locale] ?? section.heading?.["pt-BR"] ?? "Movimentos";
			const structured = parseMoveGroupsText(paragraphs, items, sectionLabel);
			if (structured.length) moves[locale] = structured;
		}

		if (Object.keys(moves).length) result.moves = moves;
	}

	if (normalizedId === "efetividade" || normalizedId === "efetividades") {
		const effectiveness = {};
		for (const locale of Object.keys(section.paragraphs ?? {})) {
			const paragraphs = section.paragraphs?.[locale] ?? [];
			const structured = parseEffectivenessGroupsText(paragraphs);
			if (structured.length) effectiveness[locale] = structured;
		}

		if (Object.keys(effectiveness).length) result.effectiveness = effectiveness;
	}

	if (normalizedId === "outras versoes") {
		const variants = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {})
		])) {
			const entries = [...(section.paragraphs?.[locale] ?? []), ...(section.items?.[locale] ?? [])]
				.map(parseVariantEntryText)
				.filter(Boolean);
			if (entries.length) variants[locale] = dedupeBySlug(entries, (entry) => entry.slug || buildSlug(entry.label, ""));
		}

		if (Object.keys(variants).length) result.variants = variants;
	}

	if (isAbilitySection(normalizedId, normalizedHeading)) {
		const abilities = {};
		for (const locale of Object.keys(section.paragraphs ?? {})) {
			const entries = parseHeadingGroupedEntries(section.paragraphs?.[locale] ?? [], "description")
				.filter((entry) => entry.name && entry.description?.length);
			if (entries.length) abilities[locale] = entries;
		}

		if (Object.keys(abilities).length) result.abilities = abilities;
	}

	// Detect tabber-style abilities in prose sections not named "Habilidades"
	// Triggers when paragraphs contain 2+ heading-grouped entries with descriptions
	if (!result.abilities && !result.steps && !result.locations && !result.difficulties
		&& !result.hazards && !result.heldCategories && !result.heldBoosts
		&& !result.questSupport && !result.questPhases && !result.clanTasks
		&& !["rewards", "tasks", "pokemon-group", "tier"].includes(kind)) {
		const inferredAbilities = {};
		for (const locale of Object.keys(section.paragraphs ?? {})) {
			const entries = parseHeadingGroupedEntries(section.paragraphs?.[locale] ?? [], "description");
			const withContent = entries.filter((e) => e.name && e.description?.length);
			if (entries.length >= 2 && withContent.length >= 2) inferredAbilities[locale] = withContent;
		}

		if (Object.keys(inferredAbilities).length) result.abilities = inferredAbilities;
	}

	if (pageCategory === "held items" && !result.steps) {
		const heldSteps = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const entries = parseHeldOperationSteps(
				normalizedId,
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
			);
			if (entries.length) heldSteps[locale] = entries;
		}

		if (Object.keys(heldSteps).length) result.steps = heldSteps;
	}

	const hasStructuredRowItems = Object.values(section.items ?? {}).some((values) =>
		(values ?? []).some((item) => String(item ?? "").includes("|"))
	);

	if (!result.steps && isStepSection(normalizedId, normalizedHeading) && !(pageCategory !== "quests" && hasStructuredRowItems)) {
		const steps = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {})
		])) {
			const entries = parseStepEntries(
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
				section.heading?.[locale] ?? section.heading?.[PT_BR] ?? ""
			);

			if (entries.length) steps[locale] = entries;
		}

		if (Object.keys(steps).length) result.steps = steps;
	}

	if (isLocationSection(normalizedId, normalizedHeading)) {
		const locations = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {})
		])) {
			const entries = parseLocationEntries(section.paragraphs?.[locale] ?? [], section.items?.[locale] ?? []);
			if (entries.length) locations[locale] = entries;
		}

		if (Object.keys(locations).length) result.locations = locations;
	}

	if (!result.locations && pageCategory === "quests" && isQuestLocationSection(normalizedId, normalizedHeading)) {
		const locations = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const entries = parseLocationEntries(section.paragraphs?.[locale] ?? [], section.items?.[locale] ?? []);
			if (entries.length) locations[locale] = entries;
		}

		if (Object.keys(locations).length) result.locations = locations;
	}

	if (isBossFightDifficultySection(normalizedId, normalizedHeading, pageCategory)) {
		const difficulties = {};
		for (const locale of Object.keys(section.paragraphs ?? {})) {
			const parsed = parseBossFightDifficultyEntries(section.paragraphs?.[locale] ?? [], section.items?.[locale] ?? []);
			if (parsed.entries.length || parsed.intro.length || parsed.notes.length) difficulties[locale] = parsed;
		}

		if (Object.keys(difficulties).length) result.difficulties = difficulties;
	}

	if (isBossSupportSection(normalizedId, normalizedHeading, pageCategory)) {
		const bossSupport = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const parsed = parseBossSupport(
				normalizedId,
				normalizedHeading,
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
			);

			if (parsed.intro.length || parsed.bullets.length || parsed.rows.length) bossSupport[locale] = parsed;
		}

		if (Object.keys(bossSupport).length) result.bossSupport = bossSupport;
	}

	if (isBossFightHeldEnhancementSection(normalizedId, normalizedHeading)) {
		const heldEnhancement = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const parsed = parseBossFightHeldEnhancementEntries(section.paragraphs?.[locale] ?? [], section.items?.[locale] ?? []);
			if (parsed.entries.length || parsed.intro.length || parsed.notes.length) heldEnhancement[locale] = parsed;
		}

		if (Object.keys(heldEnhancement).length) result.heldEnhancement = heldEnhancement;
	}

	if (isDungeonHazardSection(normalizedId, normalizedHeading)) {
		const hazards = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
			...Object.keys(section.media ?? {}),
		])) {
			const parsed = parseDungeonHazardEntries(section.paragraphs?.[locale] ?? [], section.items?.[locale] ?? []);
			if (parsed.description.length || parsed.bullets.length || (section.media?.[locale] ?? []).length) hazards[locale] = parsed;
		}

		if (Object.keys(hazards).length) result.hazards = hazards;
	}

	if (isDungeonSupportSection(normalizedId, normalizedHeading, pageCategory)) {
		const dungeonSupport = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const parsed = parseDungeonSupport(
				normalizedId,
				normalizedHeading,
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
			);

			if (parsed.intro.length || parsed.bullets.length || parsed.rows.length) dungeonSupport[locale] = parsed;
		}

		if (Object.keys(dungeonSupport).length) result.dungeonSupport = dungeonSupport;
	}

	if (isEmbeddedTowerProgressionSection(normalizedId, normalizedHeading, pageCategory)) {
		const embeddedTowerProgression = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const parsed = parseEmbeddedTowerProgression(
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
			);

			if (parsed.intro.length || parsed.attempts.length || parsed.rewards.length || parsed.resources.length) {
				embeddedTowerProgression[locale] = parsed;
			}
		}

		if (Object.keys(embeddedTowerProgression).length) result.embeddedTowerProgression = embeddedTowerProgression;
	}

	if (isEmbeddedTowerUnlockSection(normalizedId, normalizedHeading, pageCategory)) {
		const embeddedTowerUnlocks = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const parsed = parseEmbeddedTowerUnlocks(
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
			);

			if (parsed.intro.length || parsed.bullets.length || parsed.entries.length) {
				embeddedTowerUnlocks[locale] = parsed;
			}
		}

		if (Object.keys(embeddedTowerUnlocks).length) result.embeddedTowerUnlocks = embeddedTowerUnlocks;
	}

	if (isEmbeddedTowerLinkedCardsSection(normalizedId, normalizedHeading, pageCategory)) {
		const linkedCards = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.media ?? {}),
		])) {
			const parsed = parseLinkedCards(
				section.paragraphs?.[locale] ?? [],
				section.media?.[locale] ?? [],
			);

			if (parsed.intro.length || parsed.cards.length || parsed.notes.length) {
				linkedCards[locale] = parsed;
			}
		}

		if (Object.keys(linkedCards).length) result.linkedCards = linkedCards;
	}

	if (isEmbeddedTowerSupportSection(normalizedId, normalizedHeading, pageCategory)) {
		const embeddedTowerSupport = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
			...Object.keys(section.media ?? {}),
		])) {
			const parsed = parseEmbeddedTowerSupport(
				normalizedId,
				normalizedHeading,
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
			);

			if (parsed.intro.length || parsed.bullets.length || parsed.rows.length || (section.media?.[locale] ?? []).length) {
				embeddedTowerSupport[locale] = parsed;
			}
		}

		if (Object.keys(embeddedTowerSupport).length) result.embeddedTowerSupport = embeddedTowerSupport;
	}

	if (isHeldCategoriesSection(normalizedId, normalizedHeading, pageCategory)) {
		const heldCategories = {};
		for (const locale of Object.keys(section.paragraphs ?? {})) {
			const parsed = parseHeldCategoryGroups(section.paragraphs?.[locale] ?? []);
			if (parsed.groups.length) heldCategories[locale] = parsed;
		}

		if (Object.keys(heldCategories).length) result.heldCategories = heldCategories;
	}

	if (isHeldBoostSection(normalizedId, normalizedHeading, pageCategory)) {
		const heldBoosts = {};
		for (const locale of Object.keys(section.paragraphs ?? {})) {
			const parsed = parseHeldBoostGroups(section.paragraphs?.[locale] ?? []);
			if (parsed.ranges.length || parsed.utilities.length) heldBoosts[locale] = parsed;
		}

		if (Object.keys(heldBoosts).length) result.heldBoosts = heldBoosts;
	}

	if (isHeldDetailsSection(normalizedId, normalizedHeading, pageCategory)) {
		const heldDetails = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const parsed = parseHeldDetails(
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
			);

			if (parsed.intro.length || parsed.entries.length) heldDetails[locale] = parsed;
		}

		if (Object.keys(heldDetails).length) result.heldDetails = heldDetails;
	}

	if (!result.steps && pageCategory === "quests" && !["rewards", "tasks", "pokemon-group", "tier"].includes(kind) && isQuestStepSection(normalizedId, normalizedHeading)) {
		const questPhases = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
			...Object.keys(section.media ?? {}),
		])) {
			const phase = parseQuestPhase(
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
				section.media?.[locale] ?? [],
			);

			if (phase) questPhases[locale] = phase;
		}

		if (Object.keys(questPhases).length) result.questPhases = questPhases;
	}

	if (!result.steps && isQuestSupportSection(pageCategory, kind)) {
		const questSupport = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
			...Object.keys(section.media ?? {}),
		])) {
			const parsed = parseQuestSupport(
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
				section.media?.[locale] ?? [],
			);
			if (parsed.intro.length || parsed.bullets.length || parsed.cards.length) {
				questSupport[locale] = parsed;
			}
		}

		if (Object.keys(questSupport).length) result.questSupport = questSupport;
	}

	if (!result.rewards && isCommerceSection(normalizedId, normalizedHeading, section.pageKind ?? "")) {
		const commerceEntries = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const parsed = parseCommerceEntries(
				normalizedId,
				normalizedHeading,
				section.pageKind ?? "",
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
			);
			if (parsed.intro.length || parsed.bullets.length || parsed.rows.length) commerceEntries[locale] = parsed;
		}

		if (Object.keys(commerceEntries).length) result.commerceEntries = commerceEntries;
	}

	return result;
}
