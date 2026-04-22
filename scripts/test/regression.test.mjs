import test from "node:test";
import assert from "node:assert/strict";

import { extractArticleWikiLinks } from "../lib/extract.mjs";
import { shouldRecurseDiscoveredPage } from "../lib/discovery.mjs";
import { resolveDisplayInList, resolveDisplayTitle, resolvePageGroup } from "../lib/page-pipeline.mjs";
import { structureSection } from "../lib/transform.mjs";
import { PT_BR, buildLocalizedText } from "../lib/shared.mjs";

test("linked image discovery uses target title instead of image filename", () => {
	const links = extractArticleWikiLinks(`
		<h2>Eventos</h2>
		<a href="/index.php/King_Charizard_Dungeon" title="King Charizard Dungeon"><img alt="Banner Bolinha King Charizard.png" src="/images/a/aa/Banner.png"></a>
	`, "https://wiki.pokexgames.com/index.php/Nightmare_Terror");

	assert.equal(links[0].title, "King Charizard Dungeon");
	assert.equal(links[0].label, "King Charizard Dungeon");
	assert.equal(links[0].hasImage, true);
});

test("media filename titles are cleaned before display", () => {
	assert.deepEqual(
		resolveDisplayTitle(buildLocalizedText("Banner Bolinha King Charizard.png"), buildLocalizedText("Boss Fight")),
		buildLocalizedText("King Charizard"),
	);
	assert.deepEqual(
		resolveDisplayTitle(buildLocalizedText("Totodile Png"), buildLocalizedText("Pokemon")),
		buildLocalizedText("Totodile"),
	);
});

test("boss fight overview is hidden and special children are grouped", () => {
	assert.equal(resolveDisplayInList({
		category: "boss-fight",
		slug: "boss-fight",
		title: buildLocalizedText("Boss Fight"),
		pageKind: "index",
		navigationPath: ["Boss Fight"],
	}), false);

	assert.equal(resolvePageGroup({
		category: "boss-fight",
		slug: "king-charizard-dungeon",
		title: buildLocalizedText("King Charizard Dungeon"),
		navigationPath: ["Boss Fight", "Nightmare Terror"],
	})[PT_BR], "Eventos");

	assert.equal(resolvePageGroup({
		category: "boss-fight",
		slug: "boss-shiny-giant-tentacruel",
		title: buildLocalizedText("Boss Shiny Giant Tentacruel"),
		navigationPath: ["Boss Fight", "Nightmare Terror"],
	})[PT_BR], "Outros");
});

test("repeated reward rows are deduplicated per difficulty", () => {
	const section = structureSection({
		id: "recompensas",
		heading: { [PT_BR]: "Recompensas" },
		paragraphs: { [PT_BR]: [] },
		items: {
			[PT_BR]: [
				"Normal",
				"Big Bulb.png | Giant Bulb | Raro",
				"Big Bulb.png | Giant Bulb | Raro",
				"TM Tank Aleatorio | TM Tank Aleatorio | Epico",
				"TM Tank Aleatorio | TM Tank Aleatorio | Epico",
			],
		},
	});

	assert.deepEqual(section.rewards[PT_BR].map((item) => item.name), ["Giant Bulb", "TM Tank Aleatorio"]);
});

test("boss detail pages are terminal discovery nodes", () => {
	assert.equal(shouldRecurseDiscoveredPage({
		pageKind: "boss",
		title: buildLocalizedText("Lavender's Curse"),
	}, 1), false);
});

test("special reward labels are difficulties, not loot", () => {
	const section = structureSection({
		id: "recompensas",
		heading: { [PT_BR]: "Recompensas" },
		paragraphs: { [PT_BR]: [] },
		items: {
			[PT_BR]: [
				"Gold",
				"Wool Ball.png | Wool Ball | Comum",
				"Nightmare",
				"Recipe T1H.png | Cosmic Addons Recipe | Epico",
				"Especialista",
				"Cursed Ghostly Hand.gif | Cursed Ghostly Hand | Comum",
				"HrnVNwK.png | Darknesss Stone | 9 a 11 | Comum",
			],
		},
	});

	const rewards = section.rewards[PT_BR];
	assert.equal(rewards.some((item) => ["Gold", "Nightmare", "Especialista"].includes(item.name)), false);
	assert.deepEqual(rewards.map((item) => item.name), ["Wool Ball", "Cosmic Addons Recipe", "Cursed Ghostly Hand", "Darkness Stone"]);
	assert.deepEqual(rewards.map((item) => item.difficulty), ["Gold", "Nightmare", "Especialista", "Especialista"]);
});

test("ability-prefixed sections render as info cards", () => {
	const section = structureSection({
		id: "habilidades-do-meowth-fight-the-bite",
		heading: { [PT_BR]: "Habilidades do Meowth Fight-the-Bite" },
		paragraphs: { [PT_BR]: ["Rocket Glove"] },
		items: { [PT_BR]: [] },
	});

	assert.equal(section.kind, "info");
});
