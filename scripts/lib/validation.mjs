import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
	DIST_DIR,
	PT_BR,
	SCHEMA_VERSION,
	SOURCE_NAME,
	buildSlug,
	readJson,
} from "./shared.mjs";

function assertNoMojibake(value, fieldName) {
	if (typeof value !== "string") return;
	if (/(?:\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]|\u00E2(?:\u20AC[\u0080-\u00BF]|[\u0080-\u009F]{1,2}))/.test(value)) {
		throw new Error(`${fieldName} contains broken text encoding`);
	}
}

function isPlainObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const TYPED_SECTION_KEYS = [
	"abilities",
	"steps",
	"locations",
	"difficulties",
	"bossSupport",
	"bossRecommendations",
	"heldEnhancement",
	"hazards",
	"dungeonSupport",
	"heldCategories",
	"heldBoosts",
	"heldDetails",
	"questSupport",
	"questPhases",
	"clanTasks",
	"embeddedTowerProgression",
	"embeddedTowerUnlocks",
	"embeddedTowerSupport",
	"linkedCards",
	"commerceEntries",
	"facts",
	"tasks",
	"taskGroups",
	"pokemon",
	"rewards",
	"profile",
	"moves",
	"effectiveness",
	"variants",
];

const CATEGORY_GENERIC_ONLY_BUDGETS = {
	clans: 0.1,
	quests: 0.05,
	"boss-fight": 0.55,
	"dimensional-zone": 0.7,
	"embedded-tower": 0.7,
	"held-items": 0.7,
	"mystery-dungeons": 0.55,
};

function validateLocalizedMap(value, fieldName) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${fieldName} must be an object`);
	}

	let presentLocales = 0;
	for (const locale of [PT_BR, "en", "es"]) {
		const localizedValue = value[locale];
		if (localizedValue === undefined) continue;
		if (typeof localizedValue !== "string" || !localizedValue.trim()) {
			throw new Error(`${fieldName}.${locale} must be a non-empty string when present`);
		}

		assertNoMojibake(localizedValue, `${fieldName}.${locale}`);
		presentLocales += 1;
	}

	if (presentLocales === 0) throw new Error(`${fieldName} must contain at least one locale`);
}

function assertRfc3339(value, fieldName) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
		throw new Error(`${fieldName} must be an RFC3339 UTC timestamp`);
	}
}

function validateImageSet(value, fieldName) {
	if (value === undefined) return;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${fieldName} must be an object when present`);
	}

	for (const kind of ["sprite", "hero"]) {
		if (value[kind] === undefined) continue;
		if (!value[kind] || typeof value[kind] !== "object" || Array.isArray(value[kind])) {
			throw new Error(`${fieldName}.${kind} must be an object when present`);
		}

		if (typeof value[kind].url !== "string" || !value[kind].url.startsWith("https://")) {
			throw new Error(`${fieldName}.${kind}.url must be an https url`);
		}
	}
}

function validateRegistryPathMap(value, fieldName) {
	if (value === undefined) return;
	if (!isPlainObject(value)) throw new Error(`${fieldName} must be an object when present`);
	for (const key of ["items", "pokemon", "npcs", "definitions", "linkedCards"]) {
		validateString(value[key], `${fieldName}.${key}`);
		if (!String(value[key]).endsWith(".json")) throw new Error(`${fieldName}.${key} must be a json path`);
	}
}

function validateCanonicalRegistry(value, fieldName) {
	if (!isPlainObject(value) || !Array.isArray(value.entries)) {
		throw new Error(`${fieldName} must contain an entries array`);
	}

	const seen = new Set();
	for (const [index, entry] of value.entries.entries()) {
		if (!isPlainObject(entry)) throw new Error(`${fieldName}.entries.${index} must be an object`);
		validateString(entry.id, `${fieldName}.entries.${index}.id`);
		validateString(entry.label, `${fieldName}.entries.${index}.label`);
		if (seen.has(entry.id)) throw new Error(`${fieldName}.entries.${index} reuses duplicate id "${entry.id}"`);
		seen.add(entry.id);
		if (entry.slug !== undefined) validateString(entry.slug, `${fieldName}.entries.${index}.slug`);
		if (entry.kind !== undefined) validateString(entry.kind, `${fieldName}.entries.${index}.kind`);
		if (!Array.isArray(entry.pages)) throw new Error(`${fieldName}.entries.${index}.pages must be an array`);
		validateStringArray(entry.pages, `${fieldName}.entries.${index}.pages`);
	}
}

function validateString(value, fieldName, { allowEmpty = false } = {}) {
	if (typeof value !== "string") {
		throw new Error(`${fieldName} must be a string`);
	}

	if (!allowEmpty && !value.trim()) {
		throw new Error(`${fieldName} must be a non-empty string`);
	}

	assertNoMojibake(value, fieldName);
}

function validateStringArray(value, fieldName) {
	if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`);
	for (const [index, item] of value.entries()) {
		validateString(item, `${fieldName}.${index}`);
	}
}

function validateTableRows(rows, fieldName) {
	if (!Array.isArray(rows)) throw new Error(`${fieldName} must be an array`);
	for (const [rowIndex, row] of rows.entries()) {
		if (!isPlainObject(row)) {
			throw new Error(`${fieldName}.${rowIndex} must be an object`);
		}

		if (!Array.isArray(row.cells) || row.cells.length < 2) {
			throw new Error(`${fieldName}.${rowIndex}.cells must contain at least two cells`);
		}

		for (const [cellIndex, cell] of row.cells.entries()) {
			if (!isPlainObject(cell)) {
				throw new Error(`${fieldName}.${rowIndex}.cells.${cellIndex} must be an object`);
			}

			validateString(cell.text, `${fieldName}.${rowIndex}.cells.${cellIndex}.text`);
			if (cell.raw !== undefined) validateString(cell.raw, `${fieldName}.${rowIndex}.cells.${cellIndex}.raw`);
		}
	}
}

function validateRewardEntries(rewards, fieldName) {
	if (!Array.isArray(rewards)) throw new Error(`${fieldName} must be an array`);
	for (const [index, reward] of rewards.entries()) {
		if (!isPlainObject(reward)) throw new Error(`${fieldName}.${index} must be an object`);
		if (reward.type !== undefined) validateString(reward.type, `${fieldName}.${index}.type`);
		if (reward.name !== undefined) validateString(reward.name, `${fieldName}.${index}.name`);
		if (reward.qty !== undefined && reward.qty !== null) validateString(reward.qty, `${fieldName}.${index}.qty`);
		if (reward.rarity !== undefined && reward.rarity !== null) validateString(reward.rarity, `${fieldName}.${index}.rarity`);
		if (reward.difficulty !== undefined && reward.difficulty !== null) validateString(reward.difficulty, `${fieldName}.${index}.difficulty`);
		if (reward.place !== undefined) validateString(reward.place, `${fieldName}.${index}.place`);
		if (reward.prizes !== undefined) validateRewardEntries(reward.prizes, `${fieldName}.${index}.prizes`);
	}
}

function validateStepEntry(entry, fieldName) {
	if (!Number.isInteger(entry.index) || entry.index < 1) {
		throw new Error(`${fieldName}.index must be a positive integer`);
	}

	validateString(entry.title, `${fieldName}.title`);
	if (entry.body !== undefined) validateStringArray(entry.body, `${fieldName}.body`);
	if (entry.bullets !== undefined) validateStringArray(entry.bullets, `${fieldName}.bullets`);
	if (entry.rows !== undefined) validateTableRows(entry.rows, `${fieldName}.rows`);
}

function validateLocationEntry(entry, fieldName) {
	if (entry.description !== undefined) validateStringArray(entry.description, `${fieldName}.description`);
	if (entry.bullets !== undefined) validateStringArray(entry.bullets, `${fieldName}.bullets`);
	if (entry.rows !== undefined) validateTableRows(entry.rows, `${fieldName}.rows`);
}

function validateDifficultyPayload(entry, fieldName) {
	if (entry.intro !== undefined) validateStringArray(entry.intro, `${fieldName}.intro`);
	if (entry.notes !== undefined) validateStringArray(entry.notes, `${fieldName}.notes`);
	if (entry.entries !== undefined) {
		if (!Array.isArray(entry.entries)) throw new Error(`${fieldName}.entries must be an array`);
		for (const [index, difficulty] of entry.entries.entries()) {
			if (!isPlainObject(difficulty)) throw new Error(`${fieldName}.entries.${index} must be an object`);
			validateString(difficulty.name, `${fieldName}.entries.${index}.name`);
			if (difficulty.description !== undefined) validateString(difficulty.description, `${fieldName}.entries.${index}.description`);
			for (const numericKey of ["minimumLevel", "recommendedLevel", "levelCap"]) {
				if (difficulty[numericKey] === undefined) continue;
				if (!Number.isInteger(difficulty[numericKey]) || difficulty[numericKey] < 1) {
					throw new Error(`${fieldName}.entries.${index}.${numericKey} must be a positive integer`);
				}
			}
			if (difficulty.objective !== undefined) validateString(difficulty.objective, `${fieldName}.entries.${index}.objective`);
			if (difficulty.entryRequirement !== undefined) {
				if (!isPlainObject(difficulty.entryRequirement)) {
					throw new Error(`${fieldName}.entries.${index}.entryRequirement must be an object`);
				}
				if (!Number.isInteger(difficulty.entryRequirement.amount) || difficulty.entryRequirement.amount < 1) {
					throw new Error(`${fieldName}.entries.${index}.entryRequirement.amount must be a positive integer`);
				}
				validateString(difficulty.entryRequirement.name, `${fieldName}.entries.${index}.entryRequirement.name`);
			}
		}
	}
}

function validateBossSupportPayload(entry, fieldName) {
	validateString(entry.type, `${fieldName}.type`);
	if (!["important-info", "mechanics", "failure", "access", "recommendations", "leaderboard"].includes(entry.type)) {
		throw new Error(`${fieldName}.type is not supported`);
	}

	if (entry.intro !== undefined) validateStringArray(entry.intro, `${fieldName}.intro`);
	if (entry.bullets !== undefined) validateStringArray(entry.bullets, `${fieldName}.bullets`);
	if (entry.rows !== undefined) validateTableRows(entry.rows, `${fieldName}.rows`);
}

function validateBossRecommendationsPayload(entry, fieldName) {
	if (entry.intro !== undefined) validateStringArray(entry.intro, `${fieldName}.intro`);
	if (!Array.isArray(entry.groups)) throw new Error(`${fieldName}.groups must be an array`);
	for (const [groupIndex, group] of entry.groups.entries()) {
		if (!isPlainObject(group)) throw new Error(`${fieldName}.groups.${groupIndex} must be an object`);
		if (group.label !== undefined) validateString(group.label, `${fieldName}.groups.${groupIndex}.label`, { allowEmpty: true });
		if (group.notes !== undefined) validateStringArray(group.notes, `${fieldName}.groups.${groupIndex}.notes`);
		if (!Array.isArray(group.pokemon)) throw new Error(`${fieldName}.groups.${groupIndex}.pokemon must be an array`);
		validateStringArray(group.pokemon, `${fieldName}.groups.${groupIndex}.pokemon`);
	}
}

function validateHeldEnhancementPayload(entry, fieldName) {
	if (entry.intro !== undefined) validateStringArray(entry.intro, `${fieldName}.intro`);
	if (entry.notes !== undefined) validateStringArray(entry.notes, `${fieldName}.notes`);
	if (entry.entries !== undefined) {
		if (!Array.isArray(entry.entries)) throw new Error(`${fieldName}.entries must be an array`);
		for (const [index, difficulty] of entry.entries.entries()) {
			if (!isPlainObject(difficulty)) throw new Error(`${fieldName}.entries.${index} must be an object`);
			validateString(difficulty.difficulty, `${fieldName}.entries.${index}.difficulty`);
			if (difficulty.description !== undefined) validateString(difficulty.description, `${fieldName}.entries.${index}.description`);
			if (difficulty.tiers !== undefined) {
				if (!Array.isArray(difficulty.tiers)) throw new Error(`${fieldName}.entries.${index}.tiers must be an array`);
				for (const [tierIndex, tier] of difficulty.tiers.entries()) {
					if (!isPlainObject(tier)) throw new Error(`${fieldName}.entries.${index}.tiers.${tierIndex} must be an object`);
					if (!Number.isInteger(tier.tier) || tier.tier < 1) {
						throw new Error(`${fieldName}.entries.${index}.tiers.${tierIndex}.tier must be a positive integer`);
					}
					if (tier.value !== undefined) validateString(tier.value, `${fieldName}.entries.${index}.tiers.${tierIndex}.value`);
					for (const numericKey of ["damageBonus", "defenseBonus"]) {
						if (tier[numericKey] === undefined) continue;
						if (!Number.isInteger(tier[numericKey]) || tier[numericKey] < 0) {
							throw new Error(`${fieldName}.entries.${index}.tiers.${tierIndex}.${numericKey} must be a non-negative integer`);
						}
					}
				}
			}
		}
	}
}

function validateHazardsPayload(entry, fieldName) {
	if (entry.description !== undefined) validateStringArray(entry.description, `${fieldName}.description`);
	if (entry.bullets !== undefined) validateStringArray(entry.bullets, `${fieldName}.bullets`);
}

function validateTypedRowsSupportPayload(entry, fieldName, supportedTypes) {
	validateString(entry.type, `${fieldName}.type`);
	if (!supportedTypes.includes(entry.type)) {
		throw new Error(`${fieldName}.type is not supported`);
	}

	if (entry.intro !== undefined) validateStringArray(entry.intro, `${fieldName}.intro`);
	if (entry.bullets !== undefined) validateStringArray(entry.bullets, `${fieldName}.bullets`);
	if (entry.rows !== undefined) validateTableRows(entry.rows, `${fieldName}.rows`);
}

function validateHeldCategoriesPayload(entry, fieldName) {
	if (!Array.isArray(entry.groups)) throw new Error(`${fieldName}.groups must be an array`);
	for (const [groupIndex, group] of entry.groups.entries()) {
		if (!isPlainObject(group)) throw new Error(`${fieldName}.groups.${groupIndex} must be an object`);
		validateString(group.name, `${fieldName}.groups.${groupIndex}.name`);
		if (!Array.isArray(group.entries)) throw new Error(`${fieldName}.groups.${groupIndex}.entries must be an array`);
		for (const [entryIndex, heldEntry] of group.entries.entries()) {
			if (!isPlainObject(heldEntry)) throw new Error(`${fieldName}.groups.${groupIndex}.entries.${entryIndex} must be an object`);
			validateString(heldEntry.name, `${fieldName}.groups.${groupIndex}.entries.${entryIndex}.name`);
			if (heldEntry.description !== undefined) validateString(heldEntry.description, `${fieldName}.groups.${groupIndex}.entries.${entryIndex}.description`);
			if (!Array.isArray(heldEntry.tiers)) throw new Error(`${fieldName}.groups.${groupIndex}.entries.${entryIndex}.tiers must be an array`);
			for (const [tierIndex, tier] of heldEntry.tiers.entries()) {
				if (!isPlainObject(tier)) throw new Error(`${fieldName}.groups.${groupIndex}.entries.${entryIndex}.tiers.${tierIndex} must be an object`);
				if (!Number.isInteger(tier.tier) || tier.tier < 1) {
					throw new Error(`${fieldName}.groups.${groupIndex}.entries.${entryIndex}.tiers.${tierIndex}.tier must be a positive integer`);
				}

				validateString(tier.value, `${fieldName}.groups.${groupIndex}.entries.${entryIndex}.tiers.${tierIndex}.value`);
			}
		}
	}
}

function validateHeldBoostsPayload(entry, fieldName) {
	if (!Array.isArray(entry.ranges)) throw new Error(`${fieldName}.ranges must be an array`);
	for (const [rangeIndex, range] of entry.ranges.entries()) {
		if (!isPlainObject(range)) throw new Error(`${fieldName}.ranges.${rangeIndex} must be an object`);
		validateString(range.name, `${fieldName}.ranges.${rangeIndex}.name`);
		if (!Array.isArray(range.rows)) throw new Error(`${fieldName}.ranges.${rangeIndex}.rows must be an array`);
		for (const [rowIndex, row] of range.rows.entries()) {
			if (!isPlainObject(row)) throw new Error(`${fieldName}.ranges.${rangeIndex}.rows.${rowIndex} must be an object`);
			validateString(row.levelRange, `${fieldName}.ranges.${rangeIndex}.rows.${rowIndex}.levelRange`);
			validateString(row.boost, `${fieldName}.ranges.${rangeIndex}.rows.${rowIndex}.boost`);
		}
	}

	if (!Array.isArray(entry.utilities)) throw new Error(`${fieldName}.utilities must be an array`);
	for (const [groupIndex, group] of entry.utilities.entries()) {
		if (!isPlainObject(group)) throw new Error(`${fieldName}.utilities.${groupIndex} must be an object`);
		validateString(group.name, `${fieldName}.utilities.${groupIndex}.name`);
		if (!Array.isArray(group.entries)) throw new Error(`${fieldName}.utilities.${groupIndex}.entries must be an array`);
		for (const [entryIndex, heldEntry] of group.entries.entries()) {
			if (!isPlainObject(heldEntry)) throw new Error(`${fieldName}.utilities.${groupIndex}.entries.${entryIndex} must be an object`);
			validateString(heldEntry.name, `${fieldName}.utilities.${groupIndex}.entries.${entryIndex}.name`);
			if (heldEntry.description !== undefined) validateString(heldEntry.description, `${fieldName}.utilities.${groupIndex}.entries.${entryIndex}.description`);
			if (!Array.isArray(heldEntry.tiers)) throw new Error(`${fieldName}.utilities.${groupIndex}.entries.${entryIndex}.tiers must be an array`);
			for (const [tierIndex, tier] of heldEntry.tiers.entries()) {
				if (!isPlainObject(tier)) throw new Error(`${fieldName}.utilities.${groupIndex}.entries.${entryIndex}.tiers.${tierIndex} must be an object`);
				if (!Number.isInteger(tier.tier) || tier.tier < 1) {
					throw new Error(`${fieldName}.utilities.${groupIndex}.entries.${entryIndex}.tiers.${tierIndex}.tier must be a positive integer`);
				}

				validateString(tier.value, `${fieldName}.utilities.${groupIndex}.entries.${entryIndex}.tiers.${tierIndex}.value`);
			}
		}
	}
}

function validateHeldDetailsPayload(entry, fieldName) {
	if (entry.intro !== undefined) validateStringArray(entry.intro, `${fieldName}.intro`);
	if (!Array.isArray(entry.entries)) throw new Error(`${fieldName}.entries must be an array`);
	for (const [index, detail] of entry.entries.entries()) {
		if (!isPlainObject(detail)) throw new Error(`${fieldName}.entries.${index} must be an object`);
		validateString(detail.name, `${fieldName}.entries.${index}.name`);
		validateString(detail.value, `${fieldName}.entries.${index}.value`);
	}
}

function validateQuestSupportPayload(entry, fieldName) {
	if (entry.intro !== undefined) validateStringArray(entry.intro, `${fieldName}.intro`);
	if (entry.bullets !== undefined) validateStringArray(entry.bullets, `${fieldName}.bullets`);
	if (entry.cards !== undefined) {
		if (!Array.isArray(entry.cards)) throw new Error(`${fieldName}.cards must be an array`);
		for (const [index, card] of entry.cards.entries()) {
			if (!isPlainObject(card)) throw new Error(`${fieldName}.cards.${index} must be an object`);
			validateString(card.label, `${fieldName}.cards.${index}.label`);
			if (card.slug !== undefined) validateString(card.slug, `${fieldName}.cards.${index}.slug`);
		}
	}
}

function validateQuestPhasePayload(entry, fieldName) {
	if (entry.body !== undefined) validateStringArray(entry.body, `${fieldName}.body`);
	for (const key of ["requirements", "objectives", "npcs", "waits", "hints", "locations", "bullets"]) {
		if (entry[key] !== undefined) validateStringArray(entry[key], `${fieldName}.${key}`);
	}
	if (entry.rows !== undefined) validateTableRows(entry.rows, `${fieldName}.rows`);
	if (entry.rewards !== undefined) validateRewardEntries(entry.rewards, `${fieldName}.rewards`);
	if (entry.maps !== undefined) {
		if (!Array.isArray(entry.maps)) throw new Error(`${fieldName}.maps must be an array`);
		for (const [index, map] of entry.maps.entries()) {
			if (!isPlainObject(map)) throw new Error(`${fieldName}.maps.${index} must be an object`);
			validateString(map.url, `${fieldName}.maps.${index}.url`);
			if (!String(map.url).startsWith("https://")) {
				throw new Error(`${fieldName}.maps.${index}.url must be an https url`);
			}
			if (map.alt !== undefined) validateString(map.alt, `${fieldName}.maps.${index}.alt`);
			if (map.slug !== undefined) validateString(map.slug, `${fieldName}.maps.${index}.slug`);
		}
	}
}

function validateClanTasksPayload(entry, fieldName) {
	if (!Array.isArray(entry.ranks)) throw new Error(`${fieldName}.ranks must be an array`);
	for (const [rankIndex, rank] of entry.ranks.entries()) {
		if (!isPlainObject(rank)) throw new Error(`${fieldName}.ranks.${rankIndex} must be an object`);
		validateString(rank.title, `${fieldName}.ranks.${rankIndex}.title`);
		if (rank.intro !== undefined) validateStringArray(rank.intro, `${fieldName}.ranks.${rankIndex}.intro`);
		if (rank.rewardItems !== undefined) validateStringArray(rank.rewardItems, `${fieldName}.ranks.${rankIndex}.rewardItems`);
		if (rank.dangerRoomTeamText !== undefined) validateString(rank.dangerRoomTeamText, `${fieldName}.ranks.${rankIndex}.dangerRoomTeamText`);
		if (rank.rewardText !== undefined) validateString(rank.rewardText, `${fieldName}.ranks.${rankIndex}.rewardText`);
		if (rank.rewards !== undefined) validateRewardEntries(rank.rewards, `${fieldName}.ranks.${rankIndex}.rewards`);
		if (rank.stages !== undefined) {
			if (!Array.isArray(rank.stages)) throw new Error(`${fieldName}.ranks.${rankIndex}.stages must be an array`);
			for (const [stageIndex, stage] of rank.stages.entries()) {
				if (!isPlainObject(stage)) throw new Error(`${fieldName}.ranks.${rankIndex}.stages.${stageIndex} must be an object`);
				if (!Number.isInteger(stage.number) || stage.number < 1) {
					throw new Error(`${fieldName}.ranks.${rankIndex}.stages.${stageIndex}.number must be a positive integer`);
				}

				validateString(stage.label, `${fieldName}.ranks.${rankIndex}.stages.${stageIndex}.label`);
				if (stage.details !== undefined) validateStringArray(stage.details, `${fieldName}.ranks.${rankIndex}.stages.${stageIndex}.details`);
				if (stage.rows !== undefined) {
					if (!Array.isArray(stage.rows)) throw new Error(`${fieldName}.ranks.${rankIndex}.stages.${stageIndex}.rows must be an array`);
					for (const [rowIndex, row] of stage.rows.entries()) {
						if (!isPlainObject(row)) throw new Error(`${fieldName}.ranks.${rankIndex}.stages.${stageIndex}.rows.${rowIndex} must be an object`);
						validateString(row.amount, `${fieldName}.ranks.${rankIndex}.stages.${stageIndex}.rows.${rowIndex}.amount`);
						validateString(row.item, `${fieldName}.ranks.${rankIndex}.stages.${stageIndex}.rows.${rowIndex}.item`);
					}
				}

				if (stage.targets !== undefined) {
					if (!Array.isArray(stage.targets)) throw new Error(`${fieldName}.ranks.${rankIndex}.stages.${stageIndex}.targets must be an array`);
					for (const [targetIndex, target] of stage.targets.entries()) {
						if (!isPlainObject(target)) throw new Error(`${fieldName}.ranks.${rankIndex}.stages.${stageIndex}.targets.${targetIndex} must be an object`);
						validateString(target.amount, `${fieldName}.ranks.${rankIndex}.stages.${stageIndex}.targets.${targetIndex}.amount`);
						validateString(target.name, `${fieldName}.ranks.${rankIndex}.stages.${stageIndex}.targets.${targetIndex}.name`);
					}
				}
			}
		}
	}
}

function validateLinkedCardsPayload(entry, fieldName) {
	if (entry.intro !== undefined) validateStringArray(entry.intro, `${fieldName}.intro`);
	if (entry.notes !== undefined) validateStringArray(entry.notes, `${fieldName}.notes`);
	if (!Array.isArray(entry.cards)) throw new Error(`${fieldName}.cards must be an array`);
	for (const [index, card] of entry.cards.entries()) {
		if (!isPlainObject(card)) throw new Error(`${fieldName}.cards.${index} must be an object`);
		validateString(card.label, `${fieldName}.cards.${index}.label`);
		validateString(card.slug, `${fieldName}.cards.${index}.slug`);
	}
}

function validateEmbeddedTowerProgressionPayload(entry, fieldName) {
	if (entry.intro !== undefined) validateStringArray(entry.intro, `${fieldName}.intro`);
	if (!Array.isArray(entry.attempts)) throw new Error(`${fieldName}.attempts must be an array`);
	for (const [index, attempt] of entry.attempts.entries()) {
		if (!isPlainObject(attempt)) throw new Error(`${fieldName}.attempts.${index} must be an object`);
		validateString(attempt.floorsLabel, `${fieldName}.attempts.${index}.floorsLabel`);
		for (const numericKey of ["requiredAttempts", "refundedAttempts"]) {
			if (attempt[numericKey] !== undefined && attempt[numericKey] !== null
				&& (!Number.isInteger(attempt[numericKey]) || attempt[numericKey] < 0)) {
				throw new Error(`${fieldName}.attempts.${index}.${numericKey} must be a non-negative integer`);
			}
		}
	}

	if (!Array.isArray(entry.rewards)) throw new Error(`${fieldName}.rewards must be an array`);
	for (const [index, reward] of entry.rewards.entries()) {
		if (!isPlainObject(reward)) throw new Error(`${fieldName}.rewards.${index} must be an object`);
		validateString(reward.floorLabel, `${fieldName}.rewards.${index}.floorLabel`);
		validateStringArray(reward.levelRanges, `${fieldName}.rewards.${index}.levelRanges`);
		validateStringArray(reward.experienceValues, `${fieldName}.rewards.${index}.experienceValues`);
		if (reward.pointType !== undefined) validateString(reward.pointType, `${fieldName}.rewards.${index}.pointType`);
		if (!Array.isArray(reward.pointValues)) throw new Error(`${fieldName}.rewards.${index}.pointValues must be an array`);
		for (const [pointIndex, point] of reward.pointValues.entries()) {
			if (!Number.isInteger(point) || point < 0) {
				throw new Error(`${fieldName}.rewards.${index}.pointValues.${pointIndex} must be a non-negative integer`);
			}
		}
	}

	if (!Array.isArray(entry.resources)) throw new Error(`${fieldName}.resources must be an array`);
	for (const [index, resource] of entry.resources.entries()) {
		if (!isPlainObject(resource)) throw new Error(`${fieldName}.resources.${index} must be an object`);
		for (const key of ["floorLabel", "potionsAndElixirs", "revives", "medicine", "deathPenalty", "berries"]) {
			validateString(resource[key], `${fieldName}.resources.${index}.${key}`);
		}
	}
}

function validateEmbeddedTowerUnlocksPayload(entry, fieldName) {
	if (entry.intro !== undefined) validateStringArray(entry.intro, `${fieldName}.intro`);
	if (entry.bullets !== undefined) validateStringArray(entry.bullets, `${fieldName}.bullets`);
	if (!Array.isArray(entry.entries)) throw new Error(`${fieldName}.entries must be an array`);
	for (const [index, unlock] of entry.entries.entries()) {
		if (!isPlainObject(unlock)) throw new Error(`${fieldName}.entries.${index} must be an object`);
		validateString(unlock.bossLabel, `${fieldName}.entries.${index}.bossLabel`);
		if (unlock.floorLabel !== undefined) validateString(unlock.floorLabel, `${fieldName}.entries.${index}.floorLabel`);
		validateString(unlock.requirementText, `${fieldName}.entries.${index}.requirementText`);
		if (unlock.requiredPoints !== undefined && unlock.requiredPoints !== null
			&& (!Number.isInteger(unlock.requiredPoints) || unlock.requiredPoints < 0)) {
			throw new Error(`${fieldName}.entries.${index}.requiredPoints must be a non-negative integer`);
		}
	}
}

function validateEmbeddedTowerSupportPayload(entry, fieldName) {
	validateString(entry.type, `${fieldName}.type`);
	if (!["floor-structure", "mechanics"].includes(entry.type)) {
		throw new Error(`${fieldName}.type is not supported`);
	}

	if (entry.intro !== undefined) validateStringArray(entry.intro, `${fieldName}.intro`);
	if (entry.bullets !== undefined) validateStringArray(entry.bullets, `${fieldName}.bullets`);
	if (entry.rows !== undefined) validateTableRows(entry.rows, `${fieldName}.rows`);
}

function getTypedSectionKeys(section = {}) {
	return TYPED_SECTION_KEYS.filter((key) => section[key] !== undefined);
}

function summarizeSectionShape(section = {}) {
	const typedKeys = getTypedSectionKeys(section);
	const hasGenericContent = Boolean(section.content && Object.keys(section.content).length);
	const hasTables = Boolean(section.tables && Object.keys(section.tables).length);
	return {
		typedKeys,
		hasGenericContent,
		hasTables,
		isGenericOnly: !typedKeys.length && (hasGenericContent || hasTables),
	};
}

function validatePageShapeExpectations(page, fieldName) {
	const sectionSummaries = (page.sections ?? []).map(summarizeSectionShape);
	const typedSectionCount = sectionSummaries.filter((summary) => summary.typedKeys.length).length;
	const genericOnlySectionCount = sectionSummaries.filter((summary) => summary.isGenericOnly).length;

	if (page.category === "quests" && (page.pageKind === "quest" || page.slug === "wes-quest")) {
		if (typedSectionCount === 0) {
			throw new Error(`${fieldName} must contain typed quest sections`);
		}

		if (genericOnlySectionCount > 0) {
			throw new Error(`${fieldName} should not publish generic-only sections once quest schemas are normalized`);
		}
	}

	if (page.category === "clans" && /-tasks$/.test(page.slug)) {
		const hasClanTasks = (page.sections ?? []).some((section) => section.clanTasks && Object.keys(section.clanTasks).length);
		if (!hasClanTasks) {
			throw new Error(`${fieldName} must publish a clanTasks payload for clan task pages`);
		}
	}

	if (page.category === "held-items" && ["held-items", "held-itens"].includes(page.slug)) {
		const hasHeldFlow = (page.sections ?? []).some((section) => section.steps || section.heldCategories || section.heldBoosts);
		if (!hasHeldFlow) {
			throw new Error(`${fieldName} must publish typed held item flows or typed held item groups`);
		}
	}

	if (page.category === "boss-fight" && page.pageKind !== "index") {
		const substantialSections = (page.sections ?? []).filter((section) => {
			const content = section.content?.[PT_BR] ?? section.content?.en ?? {};
			const hasContent = (content.paragraphs?.length ?? 0) + (content.bullets?.length ?? 0) > 0;
			const hasTyped = TYPED_SECTION_KEYS.some((key) => section[key] !== undefined);
			return hasContent || hasTyped;
		});

		if (substantialSections.length >= 3) {
			const hasDifficulties = (page.sections ?? []).some((section) => section.difficulties);
			const hasRewards = (page.sections ?? []).some((section) => section.rewards);
			if (!hasDifficulties && !hasRewards) {
				throw new Error(`${fieldName} boss-fight page with substantial content must publish typed difficulties or rewards`);
			}
		}
	}

	if (page.category === "mystery-dungeons" && page.pageKind !== "index" && page.displayInList !== false) {
		const substantialSections = (page.sections ?? []).filter((section) => {
			const content = section.content?.[PT_BR] ?? section.content?.en ?? {};
			const hasContent = (content.paragraphs?.length ?? 0) + (content.bullets?.length ?? 0) > 0;
			const hasTyped = TYPED_SECTION_KEYS.some((key) => section[key] !== undefined);
			return hasContent || hasTyped;
		});

		if (substantialSections.length >= 3) {
			const hasAbilities = (page.sections ?? []).some((section) => section.abilities);
			const hasRewards = (page.sections ?? []).some((section) => section.rewards);
			if (!hasAbilities && !hasRewards) {
				throw new Error(`${fieldName} mystery-dungeon page with substantial content must publish typed abilities or rewards`);
			}
		}
	}
}

function validateSection(section, fieldName) {
	if (!section || typeof section !== "object" || Array.isArray(section)) {
		throw new Error(`${fieldName} must be an object`);
	}

	if (typeof section.id !== "string" || !section.id.trim()) {
		throw new Error(`${fieldName}.id must be a non-empty string`);
	}

	if (typeof section.kind !== "string" || !section.kind.trim()) {
		throw new Error(`${fieldName}.kind must be a non-empty string`);
	}

	if (section.heading !== undefined || section.paragraphs !== undefined || section.items !== undefined) {
		throw new Error(`${fieldName} must use v2 title/content fields, not legacy heading/paragraphs/items`);
	}

	validateLocalizedMap(section.title, `${fieldName}.title`);
	if (section.content !== undefined) {
		for (const [locale, content] of Object.entries(section.content)) {
			if (!content || typeof content !== "object" || Array.isArray(content)) {
				throw new Error(`${fieldName}.content.${locale} must be an object`);
			}

			for (const key of ["paragraphs", "bullets"]) {
				if (content[key] === undefined) continue;
				validateStringArray(content[key], `${fieldName}.content.${locale}.${key}`);
			}
		}
	}

	if (section.tables !== undefined) {
		for (const [locale, tables] of Object.entries(section.tables)) {
			if (!Array.isArray(tables)) throw new Error(`${fieldName}.tables.${locale} must be an array`);
			for (const [tableIndex, table] of tables.entries()) {
				validateTableRows(table?.rows, `${fieldName}.tables.${locale}.${tableIndex}.rows`);
			}
		}
	}

	validateStructuredEntryMap(section.abilities, `${fieldName}.abilities`, ["name", "description"], (entry, entryFieldName) => {
		validateString(entry.name, `${entryFieldName}.name`);
		if (entry.description !== undefined) validateStringArray(entry.description, `${entryFieldName}.description`);
	});
	validateStructuredEntryMap(section.steps, `${fieldName}.steps`, ["index", "title", "body", "bullets", "rows"], validateStepEntry);
	validateStructuredEntryMap(section.locations, `${fieldName}.locations`, ["description", "bullets", "rows"], validateLocationEntry);
	validateStructuredObjectMap(section.questPhases, `${fieldName}.questPhases`, ["body", "requirements", "objectives", "rewards", "npcs", "waits", "hints", "locations", "bullets", "rows", "maps"], validateQuestPhasePayload);
	validateStructuredObjectMap(section.difficulties, `${fieldName}.difficulties`, ["intro", "entries", "notes"], validateDifficultyPayload);
	validateStructuredObjectMap(section.bossSupport, `${fieldName}.bossSupport`, ["type", "intro", "bullets", "rows"], validateBossSupportPayload);
	validateStructuredObjectMap(section.bossRecommendations, `${fieldName}.bossRecommendations`, ["intro", "groups"], validateBossRecommendationsPayload);
	validateStructuredObjectMap(section.heldEnhancement, `${fieldName}.heldEnhancement`, ["intro", "entries", "notes"], validateHeldEnhancementPayload);
	validateStructuredObjectMap(section.hazards, `${fieldName}.hazards`, ["description", "bullets"], validateHazardsPayload);
	validateStructuredObjectMap(section.dungeonSupport, `${fieldName}.dungeonSupport`, ["type", "intro", "bullets", "rows"], (entry, entryFieldName) =>
		validateTypedRowsSupportPayload(entry, entryFieldName, ["overview", "access", "progression", "rotation", "mechanics"])
	);
	validateStructuredObjectMap(section.heldCategories, `${fieldName}.heldCategories`, ["groups"], validateHeldCategoriesPayload);
	validateStructuredObjectMap(section.heldBoosts, `${fieldName}.heldBoosts`, ["ranges", "utilities"], validateHeldBoostsPayload);
	validateStructuredObjectMap(section.heldDetails, `${fieldName}.heldDetails`, ["intro", "entries"], validateHeldDetailsPayload);
	validateStructuredObjectMap(section.questSupport, `${fieldName}.questSupport`, ["intro", "bullets", "cards"], validateQuestSupportPayload);
	validateStructuredObjectMap(section.clanTasks, `${fieldName}.clanTasks`, ["ranks"], validateClanTasksPayload);
	validateStructuredObjectMap(section.embeddedTowerProgression, `${fieldName}.embeddedTowerProgression`, ["intro", "attempts", "rewards", "resources"], validateEmbeddedTowerProgressionPayload);
	validateStructuredObjectMap(section.embeddedTowerUnlocks, `${fieldName}.embeddedTowerUnlocks`, ["intro", "bullets", "entries"], validateEmbeddedTowerUnlocksPayload);
	validateStructuredObjectMap(section.embeddedTowerSupport, `${fieldName}.embeddedTowerSupport`, ["type", "intro", "bullets", "rows"], validateEmbeddedTowerSupportPayload);
	validateStructuredObjectMap(section.linkedCards, `${fieldName}.linkedCards`, ["intro", "cards", "notes"], validateLinkedCardsPayload);
	validateStructuredObjectMap(section.commerceEntries, `${fieldName}.commerceEntries`, ["type", "intro", "bullets", "rows"], (entry, entryFieldName) =>
		validateTypedRowsSupportPayload(entry, entryFieldName, ["exchange", "shop", "craft", "cost", "generic"])
	);

	if (section.mediaRefs !== undefined) {
		for (const [locale, refs] of Object.entries(section.mediaRefs)) {
			if (!Array.isArray(refs) || refs.some((value) => typeof value !== "string" || !value.trim())) {
				throw new Error(`${fieldName}.mediaRefs.${locale} must be a non-empty string array`);
			}
		}
	}
}

function validateStructuredEntryMap(value, fieldName, allowedKeys, validateEntry = null) {
	if (value === undefined) return;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${fieldName} must be an object when present`);
	}

	for (const [locale, entries] of Object.entries(value)) {
		if (!Array.isArray(entries)) throw new Error(`${fieldName}.${locale} must be an array`);
		for (const [index, entry] of entries.entries()) {
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
				throw new Error(`${fieldName}.${locale}.${index} must be an object`);
			}

			for (const key of Object.keys(entry)) {
				if (!allowedKeys.includes(key)) throw new Error(`${fieldName}.${locale}.${index}.${key} is not supported`);
			}

			if (validateEntry) validateEntry(entry, `${fieldName}.${locale}.${index}`);
		}
	}
}

function validateStructuredObjectMap(value, fieldName, allowedKeys, validateEntry = null) {
	if (value === undefined) return;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${fieldName} must be an object when present`);
	}

	for (const [locale, entry] of Object.entries(value)) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			throw new Error(`${fieldName}.${locale} must be an object`);
		}

		for (const key of Object.keys(entry)) {
			if (!allowedKeys.includes(key)) throw new Error(`${fieldName}.${locale}.${key} is not supported`);
		}

		if (validateEntry) validateEntry(entry, `${fieldName}.${locale}`);
	}
}

export async function validateBundle(distDir = DIST_DIR) {
	const pagesDir = path.join(distDir, "pages");
	const manifestPath = path.join(distDir, "manifest.json");
	const manifest = await readJson(manifestPath);
	const mediaRegistry = manifest.mediaPath
		? await readJson(path.join(distDir, ...String(manifest.mediaPath).split("/")))
		: { entries: [] };
	const mediaIds = new Set((mediaRegistry?.entries ?? []).map((entry) => entry?.id).filter(Boolean));

	if (manifest.schemaVersion !== SCHEMA_VERSION) {
		throw new Error(`manifest schemaVersion must be ${SCHEMA_VERSION}`);
	}

	if (manifest.source !== SOURCE_NAME) {
		throw new Error(`manifest source must be "${SOURCE_NAME}"`);
	}

	assertRfc3339(manifest.updatedAt, "manifest.updatedAt");

	if (!Array.isArray(manifest.categories) || manifest.categories.length === 0) {
		throw new Error("manifest.categories must contain at least one category");
	}

	if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
		throw new Error("manifest.pages must contain at least one page");
	}

	validateRegistryPathMap(manifest.registries, "manifest.registries");

	const categoryIds = new Set();
	const categoryStats = new Map();
	for (const category of manifest.categories) {
		if (typeof category.id !== "string" || !category.id.trim()) {
			throw new Error("manifest category id must be a non-empty string");
		}

		validateLocalizedMap(category.label, `manifest.categories.${category.id}.label`);
		categoryIds.add(category.id);
		categoryStats.set(category.id, { totalSections: 0, genericOnlySections: 0 });
	}

	const seenSlugs = new Set();
	for (const summary of manifest.pages) {
		if (!categoryIds.has(summary.category)) {
			throw new Error(`manifest page "${summary.slug}" references unknown category "${summary.category}"`);
		}

		if (typeof summary.slug !== "string" || buildSlug(summary.slug, "") !== summary.slug) {
			throw new Error(`manifest page slug "${summary.slug}" is invalid`);
		}

		if (seenSlugs.has(summary.slug)) {
			throw new Error(`duplicate manifest page slug "${summary.slug}"`);
		}

		seenSlugs.add(summary.slug);

		if (typeof summary.url !== "string" || !summary.url.startsWith("https://")) {
			throw new Error(`manifest page "${summary.slug}" must include an https url`);
		}

		if (typeof summary.pagePath !== "string" || !summary.pagePath.trim() || !summary.pagePath.endsWith(".json")) {
			throw new Error(`manifest page "${summary.slug}" must include a non-empty pagePath ending in .json`);
		}

		if (typeof summary.pageKind !== "string" || !summary.pageKind.trim()) {
			throw new Error(`manifest page "${summary.slug}" must include a non-empty pageKind`);
		}

		validateLocalizedMap(summary.title, `manifest.pages.${summary.slug}.title`);
		validateLocalizedMap(summary.summary, `manifest.pages.${summary.slug}.summary`);
		if (summary.pageGroup !== undefined) validateLocalizedMap(summary.pageGroup, `manifest.pages.${summary.slug}.pageGroup`);
		if (summary.displayInList !== undefined && typeof summary.displayInList !== "boolean") {
			throw new Error(`manifest page "${summary.slug}".displayInList must be a boolean when present`);
		}
		validateImageSet(summary.images, `manifest.pages.${summary.slug}.images`);
		assertRfc3339(summary.fetchedAt, `manifest.pages.${summary.slug}.fetchedAt`);

		const pagePath = path.join(pagesDir, ...summary.pagePath.split("/"));
		let page;
		try {
			page = await readJson(pagePath);
		} catch {
			throw new Error(`missing page file for slug "${summary.slug}"`);
		}

		if (page.slug !== summary.slug) {
			throw new Error(`page file "${summary.slug}.json" has mismatched slug`);
		}

		if (page.category !== summary.category) {
			throw new Error(`page file "${summary.slug}.json" has mismatched category`);
		}

		if (page.url !== summary.url) {
			throw new Error(`page file "${summary.slug}.json" has mismatched url`);
		}

		if (page.source !== SOURCE_NAME) {
			throw new Error(`page file "${summary.slug}.json" has unexpected source`);
		}

		if (page.pageKind !== summary.pageKind) {
			throw new Error(`page file "${summary.slug}.json" has mismatched pageKind`);
		}

		validateLocalizedMap(page.title, `pages.${summary.slug}.title`);
		validateLocalizedMap(page.summary, `pages.${summary.slug}.summary`);
		if (page.pageGroup !== undefined) validateLocalizedMap(page.pageGroup, `pages.${summary.slug}.pageGroup`);
		if (page.displayInList !== summary.displayInList) {
			throw new Error(`page file "${summary.slug}.json" has mismatched displayInList`);
		}

		if (JSON.stringify(page.pageGroup ?? null) !== JSON.stringify(summary.pageGroup ?? null)) {
			throw new Error(`page file "${summary.slug}.json" has mismatched pageGroup`);
		}
		validateImageSet(page.images, `pages.${summary.slug}.images`);
		assertRfc3339(page.fetchedAt, `pages.${summary.slug}.fetchedAt`);

		if (JSON.stringify(page.images ?? null) !== JSON.stringify(summary.images ?? null)) {
			throw new Error(`page file "${summary.slug}.json" has mismatched images`);
		}

		if (!Array.isArray(page.sections) || page.sections.length === 0) {
			throw new Error(`page "${summary.slug}" must contain at least one section`);
		}

		page.sections.forEach((section, index) => validateSection(section, `pages.${summary.slug}.sections.${index}`));
		validatePageShapeExpectations(page, `pages.${summary.slug}`);
		const categoryStat = categoryStats.get(page.category);
		for (const section of page.sections ?? []) {
			const shape = summarizeSectionShape(section);
			if (categoryStat) {
				categoryStat.totalSections += 1;
				if (shape.isGenericOnly) categoryStat.genericOnlySections += 1;
			}
		}
		for (const [sectionIndex, section] of (page.sections ?? []).entries()) {
			for (const refs of Object.values(section.mediaRefs ?? {})) {
				for (const ref of refs ?? []) {
					if (!mediaIds.has(ref)) {
						throw new Error(`pages.${summary.slug}.sections.${sectionIndex}.mediaRefs references unknown media id "${ref}"`);
					}
				}
			}
		}

		if (summary.pageKind === "pokemon" && (!page.profile || typeof page.profile !== "object")) {
			throw new Error(`pokemon page "${summary.slug}" must contain a profile`);
		}
	}

	for (const [categoryId, budget] of Object.entries(CATEGORY_GENERIC_ONLY_BUDGETS)) {
		const stats = categoryStats.get(categoryId);
		if (!stats?.totalSections) continue;
		const ratio = stats.genericOnlySections / stats.totalSections;
		if (ratio > budget) {
			throw new Error(`category "${categoryId}" exceeds generic-only budget (${ratio.toFixed(3)} > ${budget})`);
		}
	}

	const pageDirectories = await readdir(pagesDir, { recursive: true });
	for (const relativePath of pageDirectories) {
		const fileName = relativePath.toString();
		if (!fileName.endsWith(".json")) continue;
		const slug = path.basename(fileName, ".json");
		if (!seenSlugs.has(slug)) {
			throw new Error(`dist/pages contains extra file "${fileName}" not listed in manifest`);
		}
	}

	if (manifest.mediaPath) {
		if (typeof manifest.mediaPath !== "string" || !manifest.mediaPath.endsWith(".json")) {
			throw new Error("manifest.mediaPath must be a json path when present");
		}

		if (!Array.isArray(mediaRegistry?.entries)) {
			throw new Error("media registry must contain an entries array");
		}

		const seenMediaIds = new Set();
		for (const [index, entry] of mediaRegistry.entries.entries()) {
			if (typeof entry?.id !== "string" || !entry.id.trim()) throw new Error(`media registry entry ${index} must have an id`);
			if (seenMediaIds.has(entry.id)) throw new Error(`media registry entry ${index} reuses duplicate id "${entry.id}"`);
			seenMediaIds.add(entry.id);
			if (typeof entry?.url !== "string" || !entry.url.startsWith("https://")) throw new Error(`media registry entry ${index} must have an https url`);
			if (typeof entry?.type !== "string" || !entry.type.trim()) throw new Error(`media registry entry ${index} must have a type`);
		}
	}

	if (manifest.registries) {
		for (const [registryName, registryPath] of Object.entries(manifest.registries)) {
			const registry = await readJson(path.join(distDir, ...String(registryPath).split("/")));
			validateCanonicalRegistry(registry, `registries.${registryName}`);
		}
	}
}

export async function distExists(distDir = DIST_DIR) {
	try {
		const result = await stat(distDir);
		return result.isDirectory();
	} catch {
		return false;
	}
}
