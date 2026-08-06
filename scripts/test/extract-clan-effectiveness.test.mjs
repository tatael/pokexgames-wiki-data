import test from "node:test";
import assert from "node:assert/strict";

import { extractClanEffectivenessGroups } from "../lib/extract-clan-effectiveness.mjs";

function table(mode, element, groups) {
	const rows = groups.map(([multiplier, elements]) => elements.map((name, index) => (
		index === 0
			? `<tr><td rowspan="${elements.length}">${multiplier} </td><td><img alt="${name}.png" /></td><td>${name} </td></tr>`
			: `<tr><td><img alt="${name}.png" /></td><td>${name} </td></tr>`
	)).join("")).join("");
	return `<table class="wikitable"><tbody>
		<tr><th colspan="3"><img alt="${element}.png" /> ${mode} </th></tr>
		<tr><th>Dano</th><th colspan="2">Elemento</th></tr>
		${rows}</tbody></table>`;
}

function page(...tables) {
	return `<h1><span id="Efetividades">Efetividades</span></h1><p>intro</p>${tables.join("")}<h1><span id="Outfits">Outfits</span></h1><table><tr><td>ignored</td></tr></table>`;
}

test("rowspan damage groups are rebuilt with their element and mode", () => {
	const html = page(table("Ofensivo", "Steel", [["2x", ["Fairy", "Ice", "Rock"]], ["0.5x", ["Electric", "Fire"]]]));
	const groups = extractClanEffectivenessGroups(html);

	assert.deepEqual(groups, [
		{ label: "Steel Ofensivo 2x", values: ["Fairy", "Ice", "Rock"] },
		{ label: "Steel Ofensivo 0.5x", values: ["Electric", "Fire"] },
	]);
});

test("several tables in one section keep their own element and mode", () => {
	const html = page(
		table("Ofensivo", "Water", [["2x", ["Fire"]]]),
		table("Defensivo", "Ice", [["0.5x", ["Ice"]]]),
	);

	assert.deepEqual(extractClanEffectivenessGroups(html).map((g) => g.label), [
		"Water Ofensivo 2x",
		"Ice Defensivo 0.5x",
	]);
});

test("the element icon wins when the source row mislabels its text", () => {
	// Ironhard's real Steel table pairs a Bug icon with the text "Fighting".
	const html = page(`<table class="wikitable"><tbody>
		<tr><th colspan="3"><img alt="Steel.png" /> Defensivo </th></tr>
		<tr><th>Dano</th><th colspan="2">Elemento</th></tr>
		<tr><td rowspan="2">0.5x </td><td><img alt="Bug.png" /></td><td>Fighting </td></tr>
		<tr><td><img alt="Rock.png" /></td><td>Rock </td></tr>
	</tbody></table>`);

	assert.deepEqual(extractClanEffectivenessGroups(html), [
		{ label: "Steel Defensivo 0.5x", values: ["Bug", "Rock"] },
	]);
});

test("an empty damage group is dropped rather than published with a dash", () => {
	const html = page(`<table class="wikitable"><tbody>
		<tr><th colspan="3"><img alt="Fire.png" /> Defensivo </th></tr>
		<tr><th>Dano</th><th colspan="2">Elemento</th></tr>
		<tr><td rowspan="1">0x </td><td colspan="2">- </td></tr>
	</tbody></table>`);

	assert.deepEqual(extractClanEffectivenessGroups(html), []);
});

test("pages without an effectiveness section yield nothing", () => {
	assert.deepEqual(extractClanEffectivenessGroups("<h1>Introducao</h1><p>texto</p>"), []);
	assert.deepEqual(extractClanEffectivenessGroups(""), []);
});
