import test from "node:test";
import assert from "node:assert/strict";

import { extractBossRecommendations } from "../lib/extract-boss-recommendations.mjs";

function roster(role, names) {
	const cells = names.map((name) => `<td align="center"><a href="/index.php/${name.replace(/ /g, "_")}" title="${name}"><img alt="000-${name}.png" src="/x.png" /></a> <br /> <b><a href="/index.php/${name.replace(/ /g, "_")}" title="${name}">${name}</a></b> </td>`).join("");
	return `<h3><span class="mw-headline" id="${role.replace(/ /g, "_")}"><img alt="Interface ${role}.png" src="/i.png" /> ${role}</span></h3>
		<center><table class="wikitable"><tbody>
			<tr><th colspan="5">${role} </th></tr>
			<tr>${cells}</tr>
		</tbody></table></center>`;
}

function page(...blocks) {
	return `<h2><span id="Pokémon_recomendados">Pokémon recomendados</span></h2>
		<p>Faremos abaixo algumas recomendações de Pokémon.</p>
		${blocks.join("")}
		<h2><span id="Habilidades">Habilidades</span></h2><table><tr><td>ignored</td></tr></table>`;
}

test("each role heading keeps its own roster", () => {
	const payload = extractBossRecommendations(page(
		roster("Tanque", ["Blastoise", "Big Onix", "Goodra"]),
		roster("Causador de Dano", ["Shiny Golduck", "Alolan Golem"]),
		roster("Suporte Contínuo", ["Unown Legion"]),
	));

	assert.deepEqual(payload.groups.map((group) => group.label), ["Tanque", "Causador de Dano", "Suporte Contínuo"]);
	// The tank roster must not absorb the damage dealers.
	assert.deepEqual(payload.groups[0].pokemon, ["Blastoise", "Big Onix", "Goodra"]);
	assert.deepEqual(payload.groups[1].pokemon, ["Shiny Golduck", "Alolan Golem"]);
	assert.deepEqual(payload.groups[2].pokemon, ["Unown Legion"]);
});

test("the role label drops its interface icon", () => {
	const payload = extractBossRecommendations(page(roster("Tanque", ["Blastoise", "Goodra"])));
	assert.equal(payload.groups[0].label, "Tanque", "the Interface Tank PVE.png alt must not leak in");
});

test("intro prose is kept out of the rosters", () => {
	const payload = extractBossRecommendations(page(roster("Tanque", ["Blastoise", "Goodra"])));
	assert.equal(payload.intro.length, 1);
	assert.match(payload.intro[0], /Faremos abaixo/);
	assert.ok(
		!payload.groups.some((group) => group.pokemon.some((name) => /recomenda/i.test(name))),
		"prose must never be published as a Pokémon name"
	);
});

test("pages without the section yield nothing", () => {
	assert.equal(extractBossRecommendations("<h2>Introdução</h2><p>x</p>"), null);
	assert.equal(extractBossRecommendations(""), null);
});

test("a role heading with no roster table is skipped", () => {
	const payload = extractBossRecommendations(page(
		"<h3><span id=\"Vazio\">Vazio</span></h3><p>sem tabela</p>",
		roster("Tanque", ["Blastoise", "Goodra"]),
	));
	assert.deepEqual(payload.groups.map((group) => group.label), ["Tanque"]);
});
