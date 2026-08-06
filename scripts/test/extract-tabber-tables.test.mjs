import test from "node:test";
import assert from "node:assert/strict";

import { extractHeldBoostRanges, extractTabberTables } from "../lib/extract-tabber-tables.mjs";

function panel(title, rows) {
	const body = rows.map((cells) => `<tr>${cells.map((c) => `<td>${c} </td>`).join("")}</tr>`).join("");
	return `<article class="tabber__panel" data-title="${title}"><table class="wikitable"><tbody>
		<tr><th>Faixa de Nível</th><th>Boost </th></tr>${body}</tbody></table></article>`;
}

function page(...panels) {
	return `<h2><span id="Informações_sobre_o_X-Boost">Informações sobre o X-Boost</span></h2>
		<div class="tabber"><section class="tabber__section">${panels.join("")}</section></div>
		<h2><span id="Outra">Outra</span></h2>`;
}

test("each tabber panel keeps its own tier rows", () => {
	const ranges = extractHeldBoostRanges(page(
		panel("Tier 1", [["0 a 99", "6"], ["100 a 149", "9"]]),
		panel("Tier 2", [["0 a 99", "8"], ["100 a 149", "12"]]),
	));

	assert.equal(ranges.length, 2);
	assert.equal(ranges[0].name, "Tier 1");
	// The old text parser produced a single row that was really the header.
	assert.deepEqual(ranges[0].rows, [
		{ levelRange: "0 a 99", boost: "6" },
		{ levelRange: "100 a 149", boost: "9" },
	]);
	assert.equal(ranges[1].rows[1].boost, "12");
});

test("a tabber whose header is not a level range is ignored", () => {
	const html = `<h2><span id="Informações_sobre_o_X-Boost">x</span></h2>
		<article class="tabber__panel" data-title="Tier 1"><table><tbody>
		<tr><th>Item</th><th>Custo</th></tr><tr><td>Potion</td><td>100</td></tr></tbody></table></article>`;
	assert.deepEqual(extractHeldBoostRanges(html), []);
});

test("panels are read generically, titles included", () => {
	const tables = extractTabberTables(page(panel("Tier 1", [["0 a 99", "6"]])));
	assert.equal(tables[0].title, "Tier 1");
	assert.equal(tables[0].rows.length, 2, "header plus one data row");
});

test("pages without the section or a tabber yield nothing", () => {
	assert.deepEqual(extractHeldBoostRanges("<p>nada</p>"), []);
	assert.deepEqual(extractTabberTables(""), []);
});
