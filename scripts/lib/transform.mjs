import { PT_BR, buildSlug } from "./shared.mjs";
import { cleanStructuredText, dedupeBySlug, normalizeIdToken, stripImageRefFromText } from "./transform/text.mjs";
import { classifySectionKind } from "./transform/classification.mjs";
import {
	cleanRawPokemonReferenceItems,
	cleanPokemonGroupItems,
	parseEffectivenessGroupsText,
	parseFactRows,
	parseMoveGroupsText,
	normalizePokemonRoleText,
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
import { isCommerceSection, parseCommerceEntries, parseCraftEntries } from "./transform/commerce.mjs";
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
	addBossRecommendationMediaPokemon,
	cleanBossText,
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
} from "./transform/embedded-tower.mjs";
import { parseLinkedCards } from "./transform/linked-cards.mjs";
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
	const pageCategory = normalizeIdToken(section.pageCategory ?? "");
	const hasTaskRows = [...Object.values(section.items ?? {}), ...Object.values(section.paragraphs ?? {})].some((values) =>
		(values ?? []).some((item) => /\b(?:NPC\s+.+?\s+)?(?:derrotar|entregar|coletar|capturar|trocar|encontrar|pegar|devolver)\b/i.test(String(item ?? "")))
	);

	const kind = pageCategory === "tasks" && hasTaskRows ? "tasks" : classifySectionKind(id, headingText);
	const result = { ...section, kind };
	const normalizedId = normalizeIdToken(id);
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

	if (pageCategory === "clans" && !result.pokemon && isClanPokemonPayloadSection(normalizedId, normalizedHeading)) {
		const pokemon = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {}),
		])) {
			const entries = parseClanPokemonPayloadEntries(
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
			);
			if (entries.length) pokemon[locale] = entries;
		}

		if (Object.keys(pokemon).length) result.pokemon = pokemon;
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
			const parsed = addBossRecommendationMediaPokemon(parseBossRecommendations(
				section.paragraphs?.[locale] ?? [],
				section.items?.[locale] ?? [],
			), section.media?.[locale] ?? []);
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
			const structured = pageCategory === "clans"
				? parseClanEffectivenessGroups(paragraphs)
				: parseEffectivenessGroupsText(paragraphs);
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
				.map(cleanAbilityEntryMediaOnlyLines)
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
			const withContent = entries.map(cleanAbilityEntryMediaOnlyLines).filter((e) => e.name && e.description?.length);
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

	if (isBossSupportSection(normalizedId, normalizedHeading, pageCategory) && !isBossRecommendationsSection(normalizedId, normalizedHeading, pageCategory)) {
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

	if (section.wikiLinks || isEmbeddedTowerLinkedCardsSection(normalizedId, normalizedHeading, pageCategory)) {
		const linkedCards = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.media ?? {}),
			...Object.keys(section.wikiLinks ?? {}),
		])) {
			const parsed = parseLinkedCards(
				section.paragraphs?.[locale] ?? [],
				section.media?.[locale] ?? [],
				section.wikiLinks?.[locale] ?? [],
				{ allowMediaFallback: !section.wikiLinks },
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

	if (result.commerceEntries) {
		const craftEntries = {};
		for (const locale of Object.keys(section.items ?? {})) {
			const commerce = result.commerceEntries?.[locale];
			if (commerce?.type !== "craft") continue;
			const parsed = parseCraftEntries(
				section.heading?.[locale] ?? section.heading?.[PT_BR] ?? "",
				section.items?.[locale] ?? [],
			);
			if (parsed.length) craftEntries[locale] = { entries: parsed };
		}

		if (Object.keys(craftEntries).length) result.craftEntries = craftEntries;
	}

	if (pageCategory === "boss fight") {
		result.paragraphs = cleanLocalizedStringLists(result.paragraphs, cleanBossText);
		result.items = cleanLocalizedStringLists(result.items, cleanBossText);
	}

	if (pageCategory === "embedded tower") {
		result.paragraphs = splitLocalizedStringLists(result.paragraphs, splitEmbeddedTowerDenseText);
		if (normalizedId === "introducao" || normalizedHeading === "introducao") {
			result.items = filterLocalizedStringLists(result.items, (item) => !isEmbeddedTowerIntroUnlockRow(item));
		}
	}

	return result;
}

function cleanAbilityEntryMediaOnlyLines(entry) {
	return {
		...entry,
		description: (entry.description ?? []).filter((value) => !isMediaOnlyText(value)),
	};
}

function isMediaOnlyText(value = "") {
	const source = String(value ?? "").trim();
	if (!source || !/\.(?:gif|png|jpe?g|webp|svg|mp4)\b/i.test(source)) return false;
	const withoutMedia = source
		.replace(/[\p{L}\p{N}_%()' .,&-]+?\.(?:gif|png|jpe?g|webp|svg|mp4)\b/giu, " ")
		.replace(/[|,;:()[\]\-–—]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return !withoutMedia;
}

function isClanPokemonPayloadSection(normalizedId, normalizedHeading) {
	const source = `${normalizedId} ${normalizedHeading}`;
	return /\btechnical machine\b|\btechnical records\b|\btm\b|\btr\b/.test(source)
		|| /pokemon obtido via npc de cla|pokemon obtained by clan npc/.test(source)
		|| /exclusividade do cla no pvp|pvp exclusiv/.test(source)
		|| /rotacao mid late game|mid late rotation|rotation/.test(source);
}

function parseClanPokemonPayloadEntries(paragraphs = [], items = []) {
	const seen = new Set();
	const entries = [];
	const add = (rawName, roles = {}) => {
		const parsed = roles.raw ? parsePokemonItemText(roles.raw) : null;
		const name = cleanStructuredText(parsed?.name ?? rawName)
			.replace(/\s*\((?:TM|TR)\)\s*$/i, (match) => match.toUpperCase())
			.trim();
		if (!name) return;
		const key = buildSlug(name.replace(/\s*\((?:TM|TR)\)\s*$/i, ""), "");
		const variantKey = `${key}:${/\((tm|tr)\)$/i.test(name) ? name.match(/\((tm|tr)\)$/i)?.[1]?.toLowerCase() : ""}`;
		if (!key || seen.has(variantKey)) return;
		seen.add(variantKey);
		entries.push({
			name,
			exclusive: parsed?.exclusive ?? false,
			pve: parsed?.pve ?? roles.pve ?? "Not",
			pvp: parsed?.pvp ?? roles.pvp ?? "Not",
			...(roles.tier ? { tier: roles.tier } : {}),
		});
	};

	for (const item of items ?? []) {
		const row = parseClanPokemonTableRow(item);
		if (row) {
			add(row.name, row);
			continue;
		}

		if (isClanTableHeaderText(item)) continue;

		const parsed = parsePokemonItemText(item);
		if (parsed) {
			add(parsed.name, { raw: item });
			continue;
		}

		const text = cleanStructuredText(item);
		if (isClanTableHeaderText(text)) continue;
		const token = normalizeIdToken(text);
		if (text && !/shiny de cla|nightmare world/.test(token)) add(text);
	}

	if (entries.length) return entries;

	const pokemonFileRe = /(?:#?\d{1,4}\s*[-_. ]*)?[\p{L}\p{N}'-]+(?:\s+[\p{L}\p{N}'-]+){0,2}\.png/giu;
	for (const paragraph of paragraphs ?? []) {
		const source = cleanStructuredText(paragraph);
		const fileMatches = [...source.matchAll(pokemonFileRe)];
		for (let index = 0; index < fileMatches.length; index += 1) {
			const match = fileMatches[index];
			if (isClanNonPokemonMediaFile(match[0])) continue;
			const start = (match.index ?? 0) + match[0].length;
			const end = fileMatches[index + 1]?.index ?? source.length;
			const label = cleanStructuredText(source.slice(start, end).split(/\s*,|\sou\b|\se\b|\sfale\b|\sobservacao\b/i)[0]);
			if (!label || /^(?:npc|para|rank|master)\b/i.test(label) || isClanNonPokemonLabel(label)) continue;
			add(label);
		}
	}

	return entries;
}

function parseClanPokemonTableRow(value) {
	const cells = String(value ?? "")
		.split(/\s*\|\s*/)
		.map((cell) => cleanStructuredText(cell))
		.filter(Boolean);
	if (cells.length < 2) return null;
	if (cells.every((cell) => /^(?:pokemon|pokémon|nome|name|funcao|função|tier|icone|ícone)$/i.test(normalizeIdToken(cell)))) return null;
	if (cells.some((cell) => /held recomendado/i.test(cell))) return null;

	const nameCandidates = cells.slice(0, 2)
		.map((cell) => cleanClanPokemonNameText(stripClanCellMediaText(cell)))
		.map((cell) => cleanStructuredText(cell))
		.filter((cell) => cell && !isClanNonPokemonLabel(cell) && !/^(?:pokemon|pokémon|nome|name|funcao|função|tier|icone|ícone|\d+)$/.test(normalizeIdToken(cell)));
	const name = nameCandidates
		.filter((cell) => /[A-Za-z]/.test(cell))
		.sort((left, right) => right.length - left.length)[0] ?? "";
	if (!name) return null;

	const roleCell = cells.find((cell) => /\b(?:tank|bdd|otdd|offensive|offensivetanker|off[- ]?tank|support|speedster|disrupter)\b/i.test(cell));
	const pve = roleCell ? normalizeClanRoleText(stripClanCellMediaText(roleCell)) : "Not";
	const tierCell = cells.findLast((cell) => /^(?:tm|tr|[1-4][a-z]?h?|t[1-4][a-z]?h?)\b/i.test(cleanStructuredText(stripClanCellMediaText(cell))));
	const tierText = tierCell ? cleanStructuredText(stripClanCellMediaText(tierCell)).split(/\s+/)[0] : "";
	const tier = /^(?:tm|tr)$/i.test(tierText)
		? tierText.toUpperCase()
		: tierText
			? (/^t/i.test(tierText) ? tierText.toUpperCase() : `T${tierText.toUpperCase()}`)
			: "";
	return {
		name,
		pve,
		pvp: "Not",
		...(tier ? { tier } : {}),
	};
}

function isClanTableHeaderText(value) {
	const cells = String(value ?? "")
		.split(/\s*\|\s*/)
		.map((cell) => normalizeIdToken(cleanStructuredText(cell)))
		.filter(Boolean);
	return cells.length > 1 && cells.every((cell) => /^(?:pokemon|nome|name|funcao|function|role|tier|icone|icon)$/.test(cell));
}

function isClanNonPokemonMediaFile(value) {
	const token = normalizeIdToken(String(value ?? "")
		.replace(/\.(?:png|gif|webp|jpe?g|svg)$/i, "")
		.replace(/\d+$/u, "")
		.replace(/[_-]+/g, " "));
	return /^(?:not|normal|fire|water|grass|electric|ice|fighting|poison|ground|flying|psychic|bug|rock|ghost|dragon|dark|steel|fairy|crystal)$/.test(token)
		|| /^(?:interface|attack|defense|held|rank|npc)\b/.test(token);
}

function isClanNonPokemonLabel(value) {
	const token = normalizeIdToken(value);
	return /^(?:not|attack|defense|held|tier|tm|tr|tm off tank|tm burst|tr|tank pve|bdd pve|otdd pve|offensive tank pve|offensivetanker pve)$/.test(token)
		|| /^(?:normal|fire|water|grass|electric|ice|fighting|poison|ground|flying|psychic|bug|rock|ghost|dragon|dark|steel|fairy|crystal)(?:\s+pokemon\s+nome\s+funcao)?$/.test(token)
		|| /^(?:female|male)$/.test(token)
		|| /^(?:attack|defense)\s+t\d+\b/.test(token);
}

function stripClanCellMediaText(value) {
	return cleanStructuredText(stripImageRefFromText(String(value ?? "")
		.replace(/^[\p{L}\p{N}_%().'-]+(?:\s+[\p{L}\p{N}_%().'-]+)*\.(?:png|gif|webp|jpe?g|svg)\s+/iu, "")));
}

function cleanClanPokemonNameText(value) {
	return cleanStructuredText(String(value ?? "")
		.replace(/^#?\d{1,4}(?:\s*[-_.]\s*|\s+)/u, "")
		.replace(/^[-_.]\s*/u, ""))
		.replace(/^S\.?\s*Klinklang$/i, "Shiny Klinklang");
}

function normalizeClanRoleText(value) {
	return normalizePokemonRoleText(value);
}

function parseClanEffectivenessGroups(paragraphs = []) {
	const elementNames = new Set([
		"Normal", "Fire", "Water", "Grass", "Electric", "Ice", "Fighting", "Poison", "Ground", "Flying",
		"Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy", "Crystal",
	]);
	const groups = [];
	const seen = new Set();
	for (const raw of paragraphs ?? []) {
		const text = cleanStructuredText(raw)
			.replace(/\b([\p{L}_%()'][\p{L}\p{N}_%().'-]*\.png)\b/giu, (fileName) => `${cleanStructuredText(fileName
				.replace(/\.(?:png|gif|webp|jpe?g)$/i, "")
				.replace(/^\d{1,4}[-_. ]*/, "")
				.replace(/\d+$/, "")
				.replace(/[_-]+/g, " "))} `)
			.replace(/\bDano\s+Elemento\b/i, "")
			.replace(/\s+/g, " ")
			.trim();
		if (!/\b(?:Ofensivo|Defensivo)\b/i.test(text)) continue;
		const header = text.match(/^([A-Z][A-Za-z]+)\s+(Ofensivo|Defensivo)\b/i);
		if (!header) continue;
		const baseElement = header[1];
		const mode = header[2];
		const body = text.slice(header[0].length).trim();
		for (const match of body.matchAll(/\b(2x|0\.5x|0x)\s+(.+?)(?=\s+(?:2x|0\.5x|0x)\b|$)/gi)) {
			const values = dedupeBySlug(String(match[2] ?? "")
				.split(/\s+/)
				.map((value) => cleanStructuredText(value))
				.filter((value) => elementNames.has(value)), (value) => value);
			if (!values.length) continue;
			const label = `${baseElement} ${mode} ${match[1]}`;
			const key = `${label}:${values.join("|")}`;
			if (seen.has(key)) continue;
			seen.add(key);
			groups.push({ label, values });
		}
	}

	return groups;
}

function cleanLocalizedStringLists(values, cleaner) {
	if (!values) return values;
	return Object.fromEntries(Object.entries(values).map(([locale, entries]) => [
		locale,
		(entries ?? []).map(cleaner).filter(Boolean),
	]));
}

function splitLocalizedStringLists(values, splitter) {
	if (!values) return values;
	return Object.fromEntries(Object.entries(values).map(([locale, entries]) => [
		locale,
		(entries ?? []).flatMap(splitter).filter(Boolean),
	]));
}

function filterLocalizedStringLists(values, predicate) {
	if (!values) return values;
	return Object.fromEntries(Object.entries(values).map(([locale, entries]) => [
		locale,
		(entries ?? []).filter(predicate),
	]));
}

function splitEmbeddedTowerDenseText(value = "") {
	const raw = String(value ?? "").trim();
	const text = cleanStructuredText(value);
	if (!text) return [];
	const numbered = splitEmbeddedTowerNumberedText(text);
	if (numbered.length > 1) return numbered;
	const labelRe = /\b(Level necess[aá]rio|Modalidade|Tempo|Recompensa|Tower Attempts? necess[aá]rios?|Revives?|Po[cç][oõ]es e Elixirs?|Held Itens?|Observa[cç][aã]o)\s*:/giu;
	const matches = [...text.matchAll(labelRe)];
	if (matches.length < 2) return raw ? [raw] : [];
	const prefix = cleanStructuredText(text.slice(0, matches[0].index ?? 0));
	return [
		prefix,
		...matches.map((match, index) => {
			const start = match.index ?? 0;
			const end = matches[index + 1]?.index ?? text.length;
			return cleanStructuredText(text.slice(start, end));
		}),
	].filter(Boolean);
}

function splitEmbeddedTowerNumberedText(text = "") {
	const cleaned = cleanStructuredText(text);
	if (!/\b\d+\.\s+/.test(cleaned)) return [cleaned].filter(Boolean);
	const introMatch = cleaned.match(/^(Informa[cç][oõ]es importantes)\s*:\s*/i);
	const source = introMatch ? cleaned.slice(introMatch[0].length) : cleaned;
	const parts = source
		.split(/\s+(?=\d+\.\s+)/)
		.map(cleanStructuredText)
		.filter(Boolean);
	if (parts.length < 2) return [cleaned].filter(Boolean);
	return introMatch ? [`${introMatch[1]}:`, ...parts] : parts;
}

function isEmbeddedTowerIntroUnlockRow(value = "") {
	const text = cleanStructuredText(value);
	if (!text.includes("|")) return false;
	const token = normalizeIdToken(text);
	return /\bandar\b/.test(token) && /\b(?:liberado|tower points|wish points)\b/.test(token);
}
