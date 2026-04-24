import { PT_BR, buildSlug } from "./shared.mjs";
import { cleanStructuredText, dedupeBySlug, normalizeIdToken, stripImageRefFromText } from "./transform/text.mjs";
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
	parseSimpleRewardText,
	propagateDifficulty,
} from "./transform/rewards.mjs";
import { parseTaskGroups, parseTaskObjectiveDetails, parseTaskRows } from "./transform/tasks.mjs";
import { isQuestLocationSection, isQuestStepSection, isQuestSupportSection, parseQuestPhase, parseQuestSupport } from "./transform/quests.mjs";
import { parseClanTaskRanks } from "./transform/clan-tasks.mjs";
import {
	isHeldBoostSection,
	isHeldCategoriesSection,
	parseHeldBoostGroups,
	parseHeldCategoryGroups,
	parseHeldOperationSteps,
} from "./transform/held-items.mjs";
import {
	isDifficultySection as isBossFightDifficultySection,
	isHeldEnhancementSection as isBossFightHeldEnhancementSection,
	parseDifficultyEntries as parseBossFightDifficultyEntries,
	parseHeldEnhancementEntries as parseBossFightHeldEnhancementEntries,
} from "./transform/boss-fight.mjs";
import {
	isHazardSection as isDungeonHazardSection,
	parseHazardEntries as parseDungeonHazardEntries,
} from "./transform/dungeons.mjs";
import {
	isEmbeddedTowerLinkedCardsSection,
	isEmbeddedTowerProgressionSection,
	isEmbeddedTowerUnlockSection,
	parseEmbeddedTowerProgression,
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
	publishSection,
} from "./transform/publish.mjs";

export { stripImageRefFromText } from "./transform/text.mjs";
export { parsePokemonItemText } from "./transform/pokemon.mjs";
export { parseRewardItemText } from "./transform/rewards.mjs";
export { publishSection } from "./transform/publish.mjs";

const SECTION_KIND_BY_ID = {
	"informacoes-importantes": "info",
	"informacoes-gerais": "info",
	"informacoes": "info",
	"observacoes": "info",
	"held-enhancement": "info",
	"habilidades": "info",
	"localizacao": "prose",
	"localizacoes": "prose",
	"efetividade": "prose",
	"dificuldades": "prose",
	"historia": "prose",
	"lore": "prose",
	"pokemon-recomendados": "pokemon-group",
	"pokemon": "pokemon-group",
	"pokemons": "pokemon-group",
	"recompensa": "rewards",
	"recompensas": "rewards",
	"rewards": "rewards"
};

function isTierSectionToken(value) {
	const token = normalizeIdToken(value ?? "");
	if (!token) return false;
	const compact = token.replace(/\s+/g, "");
	return /^(?:bronze|silver|gold|platinum|diamond|master)$/.test(token)
		|| /^tier\d+[a-z]?h?$/.test(compact)
		|| /^t\d+[a-z]?h?$/.test(compact)
		|| /^[sabcdr]$/.test(compact);
}

function classifySectionKind(id, headingText) {
	const normId = normalizeIdToken(id);
	if (isTierSectionToken(normId)) {
		return "tier";
	}

	if (/^nivel \d+ ao \d+$/.test(normId) || /^level \d+ to \d+$/.test(normId)) {
		return "tasks";
	}

	if (normId === "nightmare tasks") {
		return "tasks";
	}

	const normHeading = normalizeIdToken(headingText ?? "");
	if (/^nivel \d+ ao \d+$/.test(normHeading) || /^level \d+ to \d+$/.test(normHeading)) {
		return "tasks";
	}

	if (normHeading === "recompensa" || normHeading === "recompensas" || normHeading === "rewards" || /premios|premiacoes|premios dos baus/.test(normHeading)) {
		return "rewards";
	}

	if (/^habilidades?(\s+|$)/.test(normHeading)) {
		return "info";
	}

	if (normHeading === "pokemon" || normHeading === "pokemons" || normHeading === "pokemon recomendados") {
		return "pokemon-group";
	}

	if (isTierSectionToken(normHeading)) {
		return "tier";
	}

	return SECTION_KIND_BY_ID[id] ?? "prose";
}

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
		for (const locale of Object.keys(section.items ?? {})) {
			cleanedItems[locale] = cleanPokemonGroupItems(
				section.items[locale] ?? [],
				section.media?.[locale] ?? [],
			);
		}

		result.items = cleanedItems;
	}

	if (kind === "tasks") {
		const tasks = {};
		const taskGroups = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {})
		])) {
			const paragraphs = section.paragraphs?.[locale] ?? [];
			const items = section.items?.[locale] ?? [];
			const parsed = parseTaskRows(paragraphs, items);
			const grouped = parseTaskGroups(paragraphs, items, section.heading?.[locale] ?? section.heading?.[PT_BR] ?? "");
			if (parsed.length) {
				tasks[locale] = parsed;
			} else {
				const rewards = paragraphs.length ? parseSimpleRewardText(paragraphs[0]) : [];
				const targets = items
					.flatMap((item) => String(item ?? "").split(/\s*\|\s*/))
					.map((item) => stripImageRefFromText(item.trim()))
					.filter(Boolean);
				tasks[locale] = [{
					objective: section.heading?.[locale] ?? section.heading?.[PT_BR] ?? "",
					objectiveDetails: parseTaskObjectiveDetails(section.heading?.[locale] ?? section.heading?.[PT_BR] ?? ""),
					requirements: {},
					rewards,
					notes: paragraphs.slice(rewards.length ? 1 : 0),
					targets
				}].filter((task) => task.objective || task.rewards.length || task.notes.length || task.targets.length);
			}

			if (grouped.groups.length || grouped.intro.length) {
				taskGroups[locale] = grouped;
			}
		}

		if (Object.keys(tasks).length) result.tasks = tasks;
		if (Object.keys(taskGroups).length) result.taskGroups = taskGroups;
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
			const entries = parseHeadingGroupedEntries(section.paragraphs?.[locale] ?? [], "description");
			if (entries.length) abilities[locale] = entries;
		}

		if (Object.keys(abilities).length) result.abilities = abilities;
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
		])) {
			const parsed = parseDungeonHazardEntries(section.paragraphs?.[locale] ?? [], section.items?.[locale] ?? []);
			if (parsed.description.length || parsed.bullets.length) hazards[locale] = parsed;
		}

		if (Object.keys(hazards).length) result.hazards = hazards;
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

	return result;
}

