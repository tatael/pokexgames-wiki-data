import test from "node:test";
import assert from "node:assert/strict";

import { extractJsLiteral } from "../lib/extract-js-literal.mjs";
import {
	extractBoostLookup,
	extractPokelogEntries,
	extractTalentTrees,
	extractTravelNetwork,
} from "../lib/extract-tool-widgets.mjs";

const TRAVEL_HTML = `
<script>
  const pointsCities = [
    { id: "Cerulean", x: 4062, y: 3489, isVip: false, region: "Kanto" },
    { id: "Old Village", x: 3200, y: 3100, isVip: true, region: "Kanto" },
  ];
  const pointsTransports = [
    { id: "Aviator Cerulean", x: 4070, y: 3480, z: 7, region: "Kanto", img: "https://wiki/x.png" },
    { id: "Aviator Old Village", x: 3210, y: 3105, z: 7, region: "Kanto", img: "https://wiki/y.png" },
  ];
  const transports = [
    { from: "Aviator Cerulean", to: "Aviator Old Village", requiresVip: true, bidirectional: true },
    { from: "Aviator Cerulean", to: "Nowhere", requiresVip: false, bidirectional: true },
  ];
</script>`;

const BOOST_HTML = `
<script>
  const pokemonByBoost = {
    50: [ { name: "Bulbasaur", image: "001-Bulbasaur.png" } ],
    30: [ { name: "Dragonite", image: "149-Dragonite.png" }, { name: "" } ],
  };
</script>`;

const FOREST_HTML = `
<script>
  const forest = {
    maxPoints: 45,
    maxSpecialPoints: 1,
    pointsRequiredForSpecial: 30,
    trees: [
      {
        id: "t1",
        name: "Ho-oh",
        skills: [
          { id: "1", name: "Boost do Voo", value: "5", unit: "MS", desc: "Velocidade de Voo", connects_to: ["2"], prereqs: [], isStart: true },
          { id: "2", name: "Instinto de Cura", value: "20", unit: "HP", desc: "Regenera o HP", connects_to: ["1"], prereqs: ["1"] },
        ],
      },
    ],
  };
</script>`;

const POKELOG_HTML = `
<script>
  const DATA = [
    {
      dex: "298",
      foto: "298 - Azurill.png",
      nome: "Azurill",
      categoriaPokelog: "D",
      categoriaExperience: "F",
      elemento: "Normal,Fairy",
      estagios: [ { qtd: 10, research: 1, pokelog: 1, exp: 500 } ],
    },
  ];
</script>`;

test("a JS array literal is read without evaluating the page", () => {
	const value = extractJsLiteral(TRAVEL_HTML, "pointsCities");
	assert.equal(value.length, 2);
	assert.equal(value[0].id, "Cerulean");
	assert.equal(value[1].isVip, true);
});

test("a string containing braces or commas does not corrupt the parse", () => {
	const html = `const transports = [{ from: "A", to: "B", bidirectional: true, note: "Nível 30, {ver aqui}" }];`;
	const value = extractJsLiteral(html, "transports");
	assert.equal(value.length, 1);
	assert.equal(value[0].note, "Nível 30, {ver aqui}");
});

test("the travel network drops links whose endpoints are not defined", () => {
	const network = extractTravelNetwork(TRAVEL_HTML);
	assert.equal(network.points.length, 4);
	assert.equal(network.links.length, 1, "the link to the undefined stop is dropped");
	assert.equal(network.links[0].requiresVip, true);
	assert.equal(network.points.filter((point) => point.kind === "city").length, 2);
	assert.equal(network.points.find((point) => point.id === "Old Village").isVip, true);
});

test("boost groups come back sorted from highest boost down", () => {
	const lookup = extractBoostLookup(BOOST_HTML);
	assert.deepEqual(lookup.groups.map((group) => group.boost), [50, 30]);
	assert.deepEqual(lookup.groups[1].pokemon, [{ name: "Dragonite", image: "149-Dragonite.png" }]);
});

test("talent trees keep prerequisites and the point budget", () => {
	const forest = extractTalentTrees(FOREST_HTML);
	assert.equal(forest.maxPoints, 45);
	assert.equal(forest.pointsRequiredForSpecial, 30);
	assert.equal(forest.trees.length, 1);
	assert.equal(forest.trees[0].skills[0].isStart, true);
	assert.deepEqual(forest.trees[0].skills[1].prereqs, ["1"]);
});

test("pokelog entries keep their stages and split the element list", () => {
	const pokelog = extractPokelogEntries(POKELOG_HTML);
	assert.equal(pokelog.entries.length, 1);
	assert.deepEqual(pokelog.entries[0].elements, ["Normal", "Fairy"]);
	assert.deepEqual(pokelog.entries[0].stages, [{ amount: 10, research: 1, pokelog: 1, experience: 500 }]);
});

test("a page without the widget yields null rather than an empty payload", () => {
	for (const extract of [extractTravelNetwork, extractBoostLookup, extractTalentTrees, extractPokelogEntries]) {
		assert.equal(extract("<p>prose only</p>"), null);
	}
});

test("HTML authored inside a transport note is reduced to its text", () => {
	const html = `const pointsCities = [
		{ id: "A", x: 0, y: 0, isVip: false, region: "R" },
		{ id: "B", x: 1, y: 0, isVip: false, region: "R" }
	];
	const pointsTransports = [];
	const transports = [{ from: "A", to: "B", bidirectional: true, note: "Compre um <img class=\\"t\\" src=\\"x.png\\" alt=\\"Taxi\\"> Taxi Ticket com <a href=\\"y\\">NPC Travel Agent</a>" }];`;
	const note = extractTravelNetwork(html).links[0].note;
	assert.equal(note, "Compre um Taxi Ticket com NPC Travel Agent");
	assert.ok(!/[<>]/.test(note), "no markup survives into a rendered note");
});
