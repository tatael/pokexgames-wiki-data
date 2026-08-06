import test from "node:test";
import assert from "node:assert/strict";

import { extractCraftTableEntries } from "../lib/extract-craft-tables.mjs";

// Shaped like the real Cozinheiro table: icon + name in the result cell, one `<br>` per
// ingredient, and a stacked list of crafting stations in the last column.
const COOK_TABLE = `
<table class="wikitable sortable" width="70%">
<tbody><tr>
<th>Comidas</th><th>Habilidade</th><th>Tempo de espera</th><th>Materiais</th><th>Pode ser feito em</th>
</tr>
<tr>
<td><img alt="Mc Torchic.png" src="/images/0/0e/Mc_Torchic.png" width="28" height="30" /> <br /> MC Torchic</td>
<td>Skill 100</td>
<td>1 Segundo</td>
<td><img alt="Food Bag.png" src="/x.png" /> 15 Food Bags <br /> <img alt="CompressedFire.gif" src="/y.gif" /> 70 Compressed Fires <br /></td>
<td><img alt="Microwave.png" src="/z.png" /> Microwave <br /> <img alt="Futurist Stove.png" src="/w.png" /> Futurist Stove</td>
</tr>
</tbody></table>`;

// Shaped like the real Alquimista table: four columns, a "(10x)" batch result, no station.
const ALCHEMIST_TABLE = `
<table class="wikitable sortable" width="70%">
<tbody><tr>
<th>Item</th><th>Habilidade</th><th>Tempo de espera</th><th>Materiais</th>
</tr>
<tr>
<td><img alt="Kamikaze Elixir.png" src="/a.png" /> Kamikaze Elixir (10x)</td>
<td>Skill 103</td>
<td>20 Segundos</td>
<td><img alt="Dew Becker.png" src="/b.png" /> 240 Dew Beckers <br /> <img alt="Red Crushed Leaf.png" src="/c.png" /> 750 Red Crushed Leaves</td>
</tr>
</tbody></table>`;

test("a five-column cook table becomes craft entries with stations", () => {
	const entries = extractCraftTableEntries(COOK_TABLE);
	assert.equal(entries.length, 1);
	assert.deepEqual(entries[0].result, { name: "MC Torchic", quantity: 1 });
	assert.equal(entries[0].skill, 100);
	assert.equal(entries[0].duration, "1 Segundo");
	assert.equal(entries[0].station, "Microwave / Futurist Stove");
	assert.deepEqual(entries[0].ingredients, [
		{ name: "Food Bags", amount: 15 },
		{ name: "Compressed Fires", amount: 70 },
	]);
});

test("a batch result keeps its quantity out of the name", () => {
	const entries = extractCraftTableEntries(ALCHEMIST_TABLE);
	assert.equal(entries.length, 1);
	assert.deepEqual(entries[0].result, { name: "Kamikaze Elixir", quantity: 10 });
	assert.equal(entries[0].station, undefined);
	assert.deepEqual(entries[0].ingredients, [
		{ name: "Dew Beckers", amount: 240 },
		{ name: "Red Crushed Leaves", amount: 750 },
	]);
});

test("image alt text never leaks into a name", () => {
	const entries = extractCraftTableEntries(COOK_TABLE + ALCHEMIST_TABLE);
	const names = entries.flatMap((entry) => [entry.result.name, ...entry.ingredients.map((i) => i.name)]);
	for (const name of names) {
		assert.ok(!/\.(png|gif|jpe?g|webp|svg)\b/i.test(name), `${name} still carries a filename`);
	}
});

test("a wikitable that is not a recipe list is ignored", () => {
	const html = `
	<table class="wikitable">
	<tbody><tr><th>Cidade</th><th>Coordenada</th></tr>
	<tr><td>Cerulean</td><td>1024, 512</td></tr>
	</tbody></table>`;
	assert.deepEqual(extractCraftTableEntries(html), []);
});

test("a recipe row with no parseable ingredient is dropped, not published half-empty", () => {
	const html = `
	<table class="wikitable">
	<tbody><tr><th>Item</th><th>Habilidade</th><th>Tempo de espera</th><th>Materiais</th></tr>
	<tr><td>Mystery Item</td><td>Skill 50</td><td>1 Hora</td><td>desconhecido</td></tr>
	</tbody></table>`;
	assert.deepEqual(extractCraftTableEntries(html), []);
});

test("every entry satisfies the shape the overlay craft calculator reads", () => {
	for (const entry of extractCraftTableEntries(COOK_TABLE + ALCHEMIST_TABLE)) {
		assert.equal(typeof entry.result.name, "string");
		assert.ok(Number.isInteger(entry.result.quantity) && entry.result.quantity >= 1);
		assert.ok(entry.skill === null || Number.isInteger(entry.skill));
		assert.equal(typeof entry.duration, "string");
		assert.ok(entry.ingredients.length > 0);
		for (const ingredient of entry.ingredients) {
			assert.equal(typeof ingredient.name, "string");
			assert.ok(Number.isFinite(ingredient.amount) && ingredient.amount > 0);
		}
	}
});

test("recipe rows left in the commerce intro are pruned once the recipes are parsed", async () => {
	const { pruneCraftIntro } = await import("../lib/transform/commerce.mjs");
	const entries = extractCraftTableEntries(COOK_TABLE);
	const intro = [
		"Estas comidas podem ser feitas apenas nos Fogões, air fryers e microwave criados exclusivamente por Cozinheiros",
		"MC Torchic Skill 100 1 Segundo 15 Food Bags",
		"70 Compressed Fires",
		"Microwave",
		"Futurist Stove",
	];
	assert.deepEqual(pruneCraftIntro(intro, entries), [intro[0]]);
});

test("pruning leaves the intro alone when there are no recipes", async () => {
	const { pruneCraftIntro } = await import("../lib/transform/commerce.mjs");
	const intro = ["Microwave", "Futurist Stove"];
	assert.deepEqual(pruneCraftIntro(intro, []), intro);
});
