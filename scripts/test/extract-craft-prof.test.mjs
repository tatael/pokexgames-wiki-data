import test from "node:test";
import assert from "node:assert/strict";

import {
	buildCraftEntries,
	extractCraftProfData,
	listProfessionKeys,
	resolveProfessionKey,
} from "../lib/extract-craft-prof.mjs";

const PAYLOAD = {
	items: {
		poke_ball: { name: "Poké Ball", image: "https://example/pb.png", category: "material" },
		apricorn: { name: "Apricorn", category: "material" },
		iron_ore: { name: "Iron Ore", category: "material" },
		mystery_thing: { category: "material" },
	},
	professions: {
		engineer: {
			name: "Engineer",
			recipes: [
				{
					result_item_id: "poke_ball",
					result_count: 100,
					skill_required: 0,
					rank: "E",
					time_seconds: 60,
					materials: [{ item_id: "apricorn", count: 1 }, { item_id: "iron_ore", count: 10 }],
				},
				{
					result_item_id: "iron_ore",
					skill_required: 7,
					rank: "D",
					time_seconds: 3661,
					materials: [{ item_id: "mystery_thing", count: 2 }],
				},
				{ result_item_id: "apricorn", materials: [] },
			],
		},
		adventurer: { name: "Adventurer", recipes: [] },
	},
};

function pageHtml(payload) {
	return `<html><body><div id="craft-prof-app"></div><script>
	var src = window.CraftProfData;
	window.CraftProfData = ${JSON.stringify(payload)};
	</script></body></html>`;
}

test("the craft widget payload is read out of the page script", () => {
	const data = extractCraftProfData(pageHtml(PAYLOAD));
	assert.ok(data, "payload should parse");
	assert.deepEqual(listProfessionKeys(data).sort(), ["adventurer", "engineer"]);
});

test("a page without the widget yields no payload", () => {
	assert.equal(extractCraftProfData("<html><body>nothing here</body></html>"), null);
	assert.equal(extractCraftProfData(""), null);
});

test("a malformed payload is ignored rather than throwing", () => {
	assert.equal(extractCraftProfData("<script>window.CraftProfData = {items: </script>"), null);
});

test("recipes become craft entries in the shape the overlay calculator expects", () => {
	const data = extractCraftProfData(pageHtml(PAYLOAD));
	const entries = buildCraftEntries(data, "engineer");

	// The third recipe has no materials and must be dropped.
	assert.equal(entries.length, 2);

	const [first, second] = entries;
	assert.deepEqual(first.result, { name: "Poké Ball", quantity: 100 });
	assert.equal(first.skill, 0);
	assert.equal(first.duration, "1min");
	assert.equal(first.rank, "Rank E");
	assert.deepEqual(first.ingredients, [
		{ name: "Apricorn", amount: 1 },
		{ name: "Iron Ore", amount: 10 },
	]);

	// result_count is optional and defaults to a single item.
	assert.equal(second.result.quantity, 1);
	assert.equal(second.duration, "1h 1min");
	// An item missing from the catalogue still renders a readable name.
	assert.equal(second.ingredients[0].name, "Mystery Thing");
});

test("Portuguese page titles resolve to the English profession keys", () => {
	const data = extractCraftProfData(pageHtml(PAYLOAD));
	assert.equal(resolveProfessionKey(data, "Craft Profissões - Aventureiro"), "adventurer");
	assert.equal(resolveProfessionKey(data, "craft-profissoes-engenheiro"), "engineer");
	assert.equal(resolveProfessionKey(data, "Engineer"), "engineer");
	assert.equal(resolveProfessionKey(data, "Alguma outra página"), null);
	assert.equal(resolveProfessionKey(data, ""), null);
});
