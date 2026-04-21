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
