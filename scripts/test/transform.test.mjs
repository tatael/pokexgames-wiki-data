import test from "node:test";
import assert from "node:assert/strict";

import { structureSection, parsePokemonItemText, parseRewardItemText } from "../lib/transform.mjs";
import { PT_BR } from "../lib/shared.mjs";

function localizedSection(section) {
	return {
		...section,
		heading: { [PT_BR]: section.heading, en: section.heading, es: section.heading },
		paragraphs: { [PT_BR]: section.paragraphs ?? [], en: section.paragraphs ?? [], es: section.paragraphs ?? [] },
		items: { [PT_BR]: section.items ?? [], en: section.items ?? [], es: section.items ?? [] },
	};
}

test("structureSection extracts pokemon profile, moves, effectiveness and variants", () => {
	const info = structureSection(localizedSection({
		id: "informacoes-gerais",
		heading: "Informações Gerais",
		paragraphs: ["Nome: Absol Level: 120 Elemento: Dark Habilidades: Pressure, Super Luck Boost: Calculator Materia: Gardestrike ou Raibolt"],
	}));

	assert.equal(info.profile[PT_BR].name, "Absol");
	assert.deepEqual(info.profile[PT_BR].elements, ["Dark"]);
	assert.deepEqual(info.profile[PT_BR].abilities, ["Pressure", "Super Luck"]);
	assert.deepEqual(info.profile[PT_BR].materiaTargets.map((item) => item.slug), ["gardestrike", "raibolt"]);

	const moves = structureSection(localizedSection({
		id: "movimentos",
		heading: "Movimentos",
		paragraphs: ["# Level Up"],
		items: ["Slash (10s) | Physical | Dark", "Level 45", "Night Slash (12s) | Physical | Dark", "Level 60"],
	}));

	assert.equal(moves.moves[PT_BR][0].rows[0].name, "Slash");
	assert.equal(moves.moves[PT_BR][0].rows[1].level, "Level 60");

	const effectiveness = structureSection(localizedSection({
		id: "efetividade",
		heading: "Efetividade",
		paragraphs: ["Forte contra: Ghost, Psychic. Fraco contra: Fighting, Fairy."],
	}));

	assert.deepEqual(effectiveness.effectiveness[PT_BR][0], { label: "Forte contra", values: ["Ghost", "Psychic"] });

	const variants = structureSection(localizedSection({
		id: "outras-versoes",
		heading: "Outras Versões",
		items: ["absol.gif | Absol", "mega-absol.gif | Mega Absol (TM)"],
	}));

	assert.equal(variants.variants[PT_BR][1].slug, "mega-absol");
	assert.equal(variants.variants[PT_BR][1].badge, "TM");
});

test("parseRewardItemText keeps ranking places and loot difficulties structured", () => {
	assert.deepEqual(
		parseRewardItemText("1º lugar | ultra-box.png Ultra Box 2 rare-candy.png Rare Candy"),
		{
			type: "ranking",
			place: "1º lugar",
			prizes: [
				{ qty: "", name: "Ultra Box" },
				{ qty: "2", name: "Rare Candy" },
			],
		},
	);

	assert.deepEqual(
		parseRewardItemText("loot.png | Treasure Box (Fácil) | Raro"),
		{
			type: "loot",
			name: "Treasure Box",
			difficulty: "Fácil",
			rarity: "Raro",
			qty: null,
		},
	);

	assert.deepEqual(
		parseRewardItemText("Emeralds Emerald (1 -??)"),
		{
			type: "loot",
			name: "Emerald",
			difficulty: null,
			rarity: null,
			qty: "1 -??",
		},
	);

	assert.deepEqual(
		parseRewardItemText("Yellowpresent Yellow Present (Semi Raro)"),
		{
			type: "loot",
			name: "Yellow Present",
			difficulty: null,
			rarity: "Semi Raro",
			qty: null,
		},
	);

	assert.deepEqual(
		parseRewardItemText("UnpackedToy.png Unpacked Toy (Ultra Raro)"),
		{
			type: "loot",
			name: "Unpacked Toy",
			difficulty: null,
			rarity: "Ultra Raro",
			qty: null,
		},
	);
});

test("parsePokemonItemText preserves multiple roles in the same PvE or PvP field", () => {
	assert.deepEqual(
		parsePokemonItemText("Shiny Pupitar (PvE: OTDD PvE / BDD PvE / PvP: Tank PvP)"),
		{
			name: "Shiny Pupitar",
			exclusive: false,
			pve: "OTDD PvE / BDD PvE",
			pvp: "Tank PvP",
		},
	);
});

test("structureSection removes bogus Link role text from pokemon table rows", () => {
	const tier = structureSection(localizedSection({
		id: "tier-1",
		heading: "Tier 1",
		items: ["Azumarill (PvE: Link / PvP: Tank PvP)"],
	}));

	assert.deepEqual(tier.pokemon[PT_BR][0], {
		name: "Azumarill",
		exclusive: false,
		pve: "Not",
		pvp: "Tank PvP",
	});
});

test("structureSection removes raw pokemon sprite reference rows from prose sections", () => {
	const section = structureSection(localizedSection({
		id: "missoes-secretas",
		heading: "Missões secretas",
		items: [
			"074-Geodude Geodude | 081-Magnemite Magnemite",
			"669.Flabébé.png Flabébé",
			"Fale com o NPC Arthur.",
		],
	}));

	assert.deepEqual(section.items[PT_BR], ["Fale com o NPC Arthur."]);
});

test("structureSection publishes structured task cards upstream", () => {
	const dailyTier = structureSection(localizedSection({
		id: "nivel-25-ao-59",
		heading: "Nível 25 ao 59",
		paragraphs: ["25k de experiência e 1 Newbie Gifts Itens Possíveis da Newbie Gift: Superbag."],
		items: ["029-Nidoranfe Nidoranfe | 056-Mankey Mankey"],
	}));

	assert.equal(dailyTier.kind, "tasks");
	assert.equal(dailyTier.tasks[PT_BR][0].objective, "Nível 25 ao 59");
	assert.deepEqual(dailyTier.tasks[PT_BR][0].rewards.slice(0, 2), [
		{ type: "loot", name: "Experiência", icon: "xp", rarity: null, difficulty: null, qty: "25k" },
		{ type: "loot", name: "Newbie Gifts", rarity: null, difficulty: null, qty: "1" },
	]);
	assert.deepEqual(dailyTier.tasks[PT_BR][0].targets, ["Nidoranfe", "Mankey"]);

	const nightmare = structureSection(localizedSection({
		id: "nightmare-tasks",
		heading: "Visão geral",
		paragraphs: [],
		items: ["1. NPC Missy | Derrotar: 300 678-Meowstic Meowstic | Level: 400 NW Level: 50 | Exp icon 2.000.000 Exp icon nw 40.000 Black Nightmare Gem 2 Black Nightmare Gem"],
	}));

	assert.equal(nightmare.kind, "tasks");
	assert.equal(nightmare.tasks[PT_BR][0].title, "NPC Missy");
	assert.equal(nightmare.tasks[PT_BR][0].objective, "Derrotar: 300 Meowstic");
	assert.deepEqual(nightmare.tasks[PT_BR][0].requirements, ["Level: 400 NW Level: 50"]);
	assert.deepEqual(nightmare.tasks[PT_BR][0].rewards.map((reward) => [reward.name, reward.qty]), [
		["Experiência", "2.000.000"],
		["Nightmare Experience", "40.000"],
		["Black Nightmare Gem", "2"],
	]);
});

test("structureSection keeps boss legendary rewards available on normal and hard difficulties", () => {
	const section = structureSection(localizedSection({
		id: "recompensas",
		heading: "Recompensas",
		items: [
			"F\u00e1cil",
			"Entei Legendary sewing thread | Entei Sewing Kit | Lend\u00e1rio",
			"Entei TV Camera | Lend\u00e1rio",
			"Entei Backpack | Lend\u00e1rio",
			"Entei Amulet | Lend\u00e1rio",
			"Normal",
			"Flame-Essence.gif | Flame Essence | Raro",
			"Entei Legendary sewing thread | Entei Sewing Kit | \u00c9pico",
			"Entei Loot Bag | Comum",
			"Dif\u00edcil",
			"Entei Loot Bag | Comum",
		],
	}));

	const rewards = section.rewards[PT_BR];
	for (const difficulty of ["Normal", "Dif\u00edcil"]) {
		const names = rewards.filter((item) => item.difficulty === difficulty).map((item) => item.name);
		assert.ok(names.includes("Entei TV Camera"));
		assert.ok(names.includes("Entei Backpack"));
		assert.ok(names.includes("Entei Amulet"));
	}
	const hardRewards = rewards.filter((item) => item.difficulty === "Dif\u00edcil");
	assert.deepEqual(
		hardRewards.find((item) => item.name === "Entei Sewing Kit")?.rarity,
		"\u00c9pico",
	);
	assert.deepEqual(
		hardRewards.find((item) => item.name === "Flame Essence")?.rarity,
		"Raro",
	);
});
