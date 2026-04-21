import test from "node:test";
import assert from "node:assert/strict";

import {
	buildLocalizedSummary,
	resolveCategory,
	resolveCategoryLabel,
	resolveDisplayTitle,
	resolveDisplayInList,
	resolvePageGroup,
	resolveTitleOverride,
	resolveSortRank,
} from "../lib/page-pipeline.mjs";
import { PT_BR, buildLocalizedText, decodeHtmlEntities } from "../lib/shared.mjs";

test("resolveCategory routes normalized wiki pages to their source categories", () => {
	assert.equal(resolveCategory("items", "daily-kill", null, {
		title: buildLocalizedText("Daily Kill"),
		navigationPath: ["Itens", "Mochilas", "Mochilas de Quest"],
		pageKind: "item",
	}), "daily-missions");

	assert.equal(resolveCategory("items", "christmas-defender-granbull", null, {
		title: buildLocalizedText("Christmas Defender Granbull"),
		navigationPath: ["Itens", "Mochilas", "Mochilas de Eventos"],
		pageKind: "item",
	}), "events");

	assert.equal(resolveCategory("items", "dz-giant-onix", null, {
		title: buildLocalizedText("DZ Giant Onix"),
		navigationPath: ["Itens", "Mochilas"],
		pageKind: "item",
	}), "dimensional-zone");

	assert.equal(resolveCategory("items", "aggron", { [PT_BR]: { name: "Aggron" } }, {
		title: buildLocalizedText("Aggron"),
		pageKind: "item",
	}), "pokemon");

	assert.equal(resolveCategory("mystery-dungeons", "mystery-dungeon-the-darkness", null, {
		title: buildLocalizedText("Mystery Dungeon - The Darkness"),
		pageKind: "dungeons",
	}), "mystery-dungeons");

	assert.equal(resolveCategory("items", "the-chosen-one-quest", null, {
		title: buildLocalizedText("The Chosen One Quest"),
		navigationPath: ["Itens", "Mochilas", "Mochilas de Quest"],
		pageKind: "quest",
	}), "quests");

	assert.equal(resolveCategory("items", "ditto-backpack", null, {
		title: buildLocalizedText("Ditto Backpack"),
		navigationPath: ["Itens", "Mochilas", "Mochilas de Quest"],
		pageKind: "quest",
	}), "items");
});

test("buildLocalizedSummary replaces the generic local-sync placeholder", () => {
	assert.deepEqual(
		buildLocalizedSummary({ [PT_BR]: "Conteúdo local sincronizado da wiki." }, "Daily Kill"),
		{ [PT_BR]: "Daily Kill", en: "Daily Kill", es: "Daily Kill" },
	);
});

test("resolveCategoryLabel keeps normalized categories distinct", () => {
	assert.equal(resolveCategoryLabel("dimensional-zone", buildLocalizedText("Itens"))[PT_BR], "Dimensional Zone");
});

test("decodeHtmlEntities normalizes numeric and accented title entities", () => {
	assert.equal(decodeHtmlEntities("Dorabelle&#039;s Wrath &amp; Benef&iacute;cios"), "Dorabelle's Wrath & Benefícios");
});

test("resolveDisplayInList hides aliases and non-card pages from category lists", () => {
	assert.equal(resolveDisplayInList({
		category: "nightmare-world",
		slug: "beneficios-vip-esp",
		title: buildLocalizedText("Benefícios VIP (ESP)"),
		pageKind: "system",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "professions",
		slug: "aventureiro",
		title: buildLocalizedText("Aventureiro"),
		pageKind: "profession",
	}), true);

	assert.equal(resolveDisplayInList({
		category: "dimensional-zone",
		slug: "dz-ambipom",
		title: buildLocalizedText("DZ Ambipom"),
		pageKind: "zone",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "dimensional-zone",
		slug: "bronze-dungeons",
		title: buildLocalizedText("Bronze Dungeons"),
		pageKind: "zone",
	}), true);

	assert.equal(resolveDisplayInList({
		category: "professions",
		slug: "researcher",
		title: buildLocalizedText("Researcher"),
		pageKind: "profession",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "npcs",
		slug: "dimensional-mountain-quest",
		title: buildLocalizedText("Dimensional Mountain Quest"),
		pageKind: "npc",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "nightmare-world",
		slug: "beneficios-vip",
		title: buildLocalizedText("Benefícios VIP"),
		pageKind: "nightmare",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "nightmare-world",
		slug: "subject-14",
		title: buildLocalizedText("Subject (14)"),
		pageKind: "nightmare",
	}), true);

	assert.equal(resolveDisplayInList({
		category: "ultra-lab",
		slug: "dz-wynaut",
		title: buildLocalizedText("DZ Wynaut"),
		pageKind: "lab",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "ultra-lab",
		slug: "advanced-ultra-lab-raibolt",
		title: buildLocalizedText("Advanced Ultra Lab - Raibolt"),
		pageKind: "lab",
	}), true);
});

test("resolveDisplayTitle and title overrides remove redundant category prefixes", () => {
	assert.deepEqual(
		resolveDisplayTitle(buildLocalizedText("Advanced Ultra Lab - Raibolt"), buildLocalizedText("Ultra Lab")),
		buildLocalizedText("Laboratório Raibolt"),
	);
	assert.deepEqual(
		resolveTitleOverride({ category: "tasks", slug: "tasks" }),
		buildLocalizedText("Kanto Tasks"),
	);
});

test("resolveDisplayInList filters event and Nightmare Rift category noise", () => {
	assert.equal(resolveDisplayInList({
		category: "events",
		slug: "pikachu-backpack",
		title: buildLocalizedText("Pikachu Backpack"),
		pageKind: "item",
		navigationPath: ["Eventos", "Mochilas de Eventos"],
	}), false);

	assert.equal(resolveDisplayInList({
		category: "events",
		slug: "christmas-defender-granbull",
		title: buildLocalizedText("Christmas Defender Granbull"),
		pageKind: "item",
		navigationPath: ["Eventos"],
	}), true);

	assert.equal(resolveDisplayInList({
		category: "nightmare-rifts",
		slug: "cozinheiro",
		title: buildLocalizedText("Cozinheiro"),
		pageKind: "profession",
	}), false);
});

test("resolvePageGroup publishes item filter groups", () => {
	assert.equal(resolvePageGroup({
		category: "items",
		slug: "ditto-backpack",
		title: buildLocalizedText("Ditto Backpack"),
	})[PT_BR], "Mochilas");

	assert.equal(resolvePageGroup({
		category: "items",
		slug: "compressed-nightmare-gem",
		title: buildLocalizedText("Compressed Nightmare Gem"),
	})[PT_BR], "Moedas e tokens");
});

test("resolvePageGroup publishes Nightmare Rift list sections", () => {
	assert.deepEqual(resolvePageGroup({
		category: "nightmare-rifts",
		slug: "weekly-rifts",
		title: buildLocalizedText("Weekly Rifts"),
	}), {
		[PT_BR]: "Rifts Semanais",
		en: "Weekly Rifts",
		es: "Rifts Semanales",
	});
});

test("resolveSortRank publishes category-specific card order", () => {
	assert.equal(resolveSortRank({
		category: "embedded-tower",
		slug: "camara-do-jirachi",
		title: buildLocalizedText("Câmara do Jirachi"),
	}), 40);

	assert.equal(resolveSortRank({
		category: "dimensional-zone",
		slug: "golden-dungeons",
		title: buildLocalizedText("Golden Dungeons"),
	}), 30);
});
