import test from "node:test";
import assert from "node:assert/strict";

import {
	buildLocalizedSummary,
	resolveCategory,
	resolveSortRank,
} from "../lib/page-pipeline.mjs";
import { PT_BR, buildLocalizedText } from "../lib/shared.mjs";

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
	}), "quests");

	assert.equal(resolveCategory("items", "aggron", { [PT_BR]: { name: "Aggron" } }, {
		title: buildLocalizedText("Aggron"),
		pageKind: "item",
	}), "pokemon");

	assert.equal(resolveCategory("mystery-dungeons", "mystery-dungeon-the-darkness", null, {
		title: buildLocalizedText("Mystery Dungeon - The Darkness"),
		pageKind: "dungeons",
	}), "territory-guardians");
});

test("buildLocalizedSummary replaces the generic local-sync placeholder", () => {
	assert.deepEqual(
		buildLocalizedSummary({ [PT_BR]: "Conteúdo local sincronizado da wiki." }, "Daily Kill"),
		{ [PT_BR]: "Daily Kill", en: "Daily Kill", es: "Daily Kill" },
	);
});

test("resolveSortRank publishes category-specific card order", () => {
	assert.equal(resolveSortRank({
		category: "embedded-tower",
		slug: "camara-do-jirachi",
		title: buildLocalizedText("Câmara do Jirachi"),
	}), 60);

	assert.equal(resolveSortRank({
		category: "dimensional-zone",
		slug: "golden-dungeons",
		title: buildLocalizedText("Golden Dungeons"),
	}), 30);
});
