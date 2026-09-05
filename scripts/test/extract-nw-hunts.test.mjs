import test from "node:test";
import assert from "node:assert/strict";

import {
	extractHuntProfile,
	extractHuntSpots,
	huntEntriesAsLinks,
	huntTitleFromLink,
} from "../lib/extract-nw-hunts.mjs";

const INDEX_HTML = `
<div><p>Locais de caça</p></div>
<script>
	const hunts = {
		"NW": [
{"name":"Litleo","difficulty":"Baixa","local":["Fuchsia"],"classes":["Orebound","Seavell"],"imageUrl":"https://wiki.pokexgames.com/images/2/22/Litleo.webp","huntTypes":["Normal","Fire"],"huntTipo":"Elemental","link":"https://wiki.pokexgames.com/index.php/Nightmare_Hunt_-_Litleo"},
{"name":"Sentinel","difficulty":"Baixa","local":["Pewter","Todos"],"classes":["Todos"],"huntTypes":["Neutral"],"huntTipo":"Neutro","link":"https://wiki.pokexgames.com/index.php/Nightmare_Hunt_-_Sentinel","altName":"Small Sentinel"},
{"name":"Alolan Grimer","difficulty":"Alta","local":["Cinnabar"],"classes":["Orebound"],"huntTypes":["Poison","Ground"],"huntTipo":"Elemental","link":"https://wiki.pokexgames.com/index.php/Nightmare_Hunt_-_Alolan Grimer"}
		]
	};
</script>`;

const DETAIL_HTML = `
<center><img alt="Banner.webp" src="/images/banner.webp" /><br /></center>
<p><b>Dificuldade</b>: Alta.<br />
<b>Resistência</b>: Pallet e Cinnabar.<br />
<b>Clãs indicados</b>: <a href="/Orebound"><img alt="Orebound1.png" src="/x.png" /></a> Orebound, <a href="/Seavell"><img src="/y.png" /></a> Seavell. <br />
</p>
<h2><span class="mw-headline" id="Informações_importantes">Informações importantes</span></h2>
<ul><li>O <a href="/Shiny_Turtonator"><img src="/z.png" /></a> <b>Shiny Turtonator</b> é o Boss encontrado neste local.</li>
<li>O <a href="/Turtonator"><img src="/w.png" /></a> <b>Angry Turtonator</b> é o Pokémon Angry deste local.</li></ul>
<h2><span class="mw-headline" id="Efetividades">Efetividades</span></h2>
<p><b>Elemento que causa dano super efetivo neste local</b></p>
<table class="wikitable"><tr><th colspan="2">Elementos</th></tr>
<tr><td><img alt="water.png" src="/water.png" /></td><td><b>Water</b></td></tr>
<tr><td><img alt="ground.png" src="/ground.png" /></td><td><b>Ground</b></td></tr></table>`;

// ---- index widget ----------------------------------------------------------

test("the hunting-spot index is read from its script literal", () => {
	const spots = extractHuntSpots(INDEX_HTML);
	assert.equal(spots.length, 3);
	assert.equal(spots[0].name, "Litleo");
	assert.equal(spots[0].difficulty, "baixa");
	assert.deepEqual(spots[0].cities, ["Fuchsia"]);
	assert.deepEqual(spots[0].clans, [
		{ slug: "orebound", label: "Orebound" },
		{ slug: "seavell", label: "Seavell" },
	]);
});

// Every consumer keys on the lowercase form; publishing "Fire" next to a lookup keyed "fire"
// is the mismatch that has silently emptied element filters in this project before.
test("elements are published as lowercase keys", () => {
	const [litleo] = extractHuntSpots(INDEX_HTML);
	assert.deepEqual(litleo.elements, ["normal", "fire"]);
});

test('"Todos" is a flag, not a clan or a city', () => {
	const sentinel = extractHuntSpots(INDEX_HTML).find((spot) => spot.name === "Sentinel");
	assert.equal(sentinel.everyClan, true);
	assert.deepEqual(sentinel.clans, []);
	assert.deepEqual(sentinel.cities, ["Pewter"], "the literal Todos city is dropped");
});

// A "Neutral" spot favours nobody, so it must not claim an element that no chart has.
test("neutral spots publish no element", () => {
	const sentinel = extractHuntSpots(INDEX_HTML).find((spot) => spot.name === "Sentinel");
	assert.equal(sentinel.neutral, true);
	assert.deepEqual(sentinel.elements, []);
	assert.equal(sentinel.altName, "Small Sentinel");
});

test("a page with no hunts literal yields nothing rather than throwing", () => {
	assert.deepEqual(extractHuntSpots("<p>nothing here</p>"), []);
	assert.deepEqual(extractHuntSpots(null), []);
});

// The index is the only place these 106 pages are linked from; discovery walks <a> tags and
// finds zero on the page, which is why the bundle carried one page where the wiki has 106.
test("index entries become crawlable links", () => {
	const links = huntEntriesAsLinks(INDEX_HTML, "https://wiki.pokexgames.com/index.php/Nightmare_Hunts");
	assert.equal(links.length, 3);
	assert.equal(links[0].title, "Nightmare Hunt - Litleo");
	assert.equal(links[0].url, "https://wiki.pokexgames.com/index.php/Nightmare_Hunt_-_Litleo");
});

// Six entries write the link with raw spaces instead of underscores.
test("a link written with spaces still resolves", () => {
	const links = huntEntriesAsLinks(INDEX_HTML, "https://wiki.pokexgames.com/index.php/Nightmare_Hunts");
	const grimer = links.find((link) => link.label === "Alolan Grimer");
	assert.equal(grimer.title, "Nightmare Hunt - Alolan Grimer");
	assert.equal(grimer.url, "https://wiki.pokexgames.com/index.php/Nightmare_Hunt_-_Alolan_Grimer");
});

test("titles survive percent-encoding", () => {
	assert.equal(
		huntTitleFromLink("https://wiki.pokexgames.com/index.php/Nightmare_Hunt_-_Galarian_Farfetchd"),
		"Nightmare Hunt - Galarian Farfetchd",
	);
});

// ---- detail pages ----------------------------------------------------------

test("the lead facts are read from their bold labels", () => {
	const profile = extractHuntProfile(DETAIL_HTML);
	assert.equal(profile.difficulty, "alta");
	assert.deepEqual(profile.cities, ["Pallet", "Cinnabar"]);
	assert.deepEqual(profile.clans.map((clan) => clan.slug), ["orebound", "seavell"]);
});

// This is the field a party is matched against: what to bring, not what the place deals.
test("the super-effective element table is read as lowercase keys", () => {
	// The table's "Elementos" header is a <th>, so it must not land in the list.
	assert.deepEqual(extractHuntProfile(DETAIL_HTML).weakTo, ["water", "ground"]);
});

test("the boss and the angry are pulled out of the prose bullets", () => {
	const profile = extractHuntProfile(DETAIL_HTML);
	assert.equal(profile.boss, "Shiny Turtonator");
	assert.equal(profile.angry, "Angry Turtonator");
});

test("a page carrying none of the facts publishes no profile", () => {
	assert.equal(extractHuntProfile("<p>just prose</p>"), null);
});

// Detail pages spell it "Todos os clãs são indicados" where the index writes bare "Todos".
test("every spelling of all-clans sets the flag", () => {
	const html = DETAIL_HTML.replace(
		/<b>Clãs indicados<\/b>:[\s\S]*?<br \/>/,
		"<b>Clãs indicados</b>: Todos os clãs são indicados. <br />",
	);
	const profile = extractHuntProfile(html);
	assert.equal(profile.everyClan, true);
	assert.deepEqual(profile.clans, []);
});

// ---- the CMS marker comment ------------------------------------------------

import { extractJsLiteral } from "../lib/extract-js-literal.mjs";
import { extractCraftProfData } from "../lib/extract-craft-prof.mjs";

// The wiki started writing `Data = /* CMS_DATA_START */ {…}`. The comment between the "=" and
// the object made both readers miss, and the craft page published with every recipe dropped —
// silently, because a page with prose still passes validation.
test("a data literal is found through a CMS marker comment", () => {
	const html = '<script>const hunts = /* CMS_DATA_START */ { "NW": [] };</script>';
	assert.deepEqual(extractJsLiteral(html, "hunts"), { NW: [] });
});

test("craft recipes are found through the same comment", () => {
	const html = '<script>window.CraftProfData = /* CMS_DATA_START */ {"items":{},"professions":{}};</script>';
	assert.deepEqual(Object.keys(extractCraftProfData(html) ?? {}), ["items", "professions"]);
});

// The wiki dropped the `window.` prefix on some pages while keeping it on others.
test("the window prefix is optional", () => {
	const html = '<script>CraftProfData = {"items":{},"professions":{}};</script>';
	assert.ok(extractCraftProfData(html));
});

// ---- caption lines ---------------------------------------------------------

import { parseLocationEntries } from "../lib/transform/generic-sections.mjs";

// The picture strip on a hunting-spot page leaves a paragraph of bare file names directly
// above the images it names.
test("location captions that are only file names are dropped", () => {
	const [entry] = parseLocationEntries([
		"Este local fica na resistência de Fuchsia.",
		"Minimap - Locais de Caça (Luxray) 3.webp Minimap - Locais de Caça (Luxray) 4.webp",
	], []);
	assert.equal(entry.description.length, 1);
	assert.match(entry.description[0], /Fuchsia/);
});

// Dropping them from a section that is nothing but a picture strip empties the payload, and
// the section then publishes as generic-only — which bundle validation rejects.
test("a section that is only captions keeps them", () => {
	const [entry] = parseLocationEntries(["Mapa 1.webp Mapa 2.webp"], []);
	assert.equal(entry.description.length, 1);
});

test("prose that merely mentions a file is kept", () => {
	const [entry] = parseLocationEntries(["Veja o mapa acima, marcado em vermelho."], []);
	assert.equal(entry.description.length, 1);
});
