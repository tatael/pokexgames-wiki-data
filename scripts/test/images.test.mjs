import test from "node:test";
import assert from "node:assert/strict";

import { discoverPageImages, extractLeadWikiImageUrl, extractPageImagesFromUrls, showdownPokemonSlug } from "../lib/images.mjs";

test("extractPageImagesFromUrls prefers static sprite assets over gif fallbacks", () => {
	const images = extractPageImagesFromUrls([
		"https://wiki.pokexgames.com/images/c/c8/149_-_Dragonite.gif",
		"https://wiki.pokexgames.com/images/4/48/149_-_Dragonite.png",
	], "dragonite");

	assert.deepEqual(images, {
		sprite: { url: "https://wiki.pokexgames.com/images/4/48/149_-_Dragonite.png" },
		hero: { url: "https://wiki.pokexgames.com/images/c/c8/149_-_Dragonite.gif" },
	});
});

test("extractPageImagesFromUrls falls back to gif sprite when no static asset exists", () => {
	const images = extractPageImagesFromUrls([
		"https://wiki.pokexgames.com/images/c/c8/149_-_Dragonite.gif",
	], "dragonite");

	assert.deepEqual(images, {
		sprite: { url: "https://wiki.pokexgames.com/images/c/c8/149_-_Dragonite.gif" },
		hero: { url: "https://wiki.pokexgames.com/images/c/c8/149_-_Dragonite.gif" },
	});
});

test("discoverPageImages searches wiki file pages for missing pokemon images", async () => {
	const calls = [];
	const images = await discoverPageImages("throh", async (params) => {
		calls.push(params);
		return {
			query: {
				pages: {
					"538": {
						title: "File:538-Throh.png",
						imageinfo: [{ url: "https://wiki.pokexgames.com/images/8/88/538-Throh.png" }],
					},
				},
			},
		};
	});

	assert.deepEqual(images, {
		sprite: { url: "https://wiki.pokexgames.com/images/8/88/538-Throh.png" },
		hero: { url: "https://wiki.pokexgames.com/images/8/88/538-Throh.png" },
	});

	assert.equal(calls[0].generator, "search");
	assert.equal(calls[0].gsrnamespace, "6");
});

test("extractPageImagesFromUrls matches numbered pokemon forms", () => {
	const images = extractPageImagesFromUrls([
		"https://wiki.pokexgames.com/images/a/a1/Smeargle_7.png",
	], "smeargle-7");

	assert.deepEqual(images, {
		sprite: { url: "https://wiki.pokexgames.com/images/a/a1/Smeargle_7.png" },
		hero: { url: "https://wiki.pokexgames.com/images/a/a1/Smeargle_7.png" },
	});
});

test("extractPageImagesFromUrls treats S-prefix files as shiny variants", () => {
	const images = extractPageImagesFromUrls([
		"https://wiki.pokexgames.com/images/6/68/S.klinklang.png",
		"https://wiki.pokexgames.com/images/0/00/Klinklang.gif",
	], "shiny-klinklang");

	assert.deepEqual(images, {
		sprite: { url: "https://wiki.pokexgames.com/images/6/68/S.klinklang.png" },
		hero: { url: "https://wiki.pokexgames.com/images/6/68/S.klinklang.png" },
	});
});

test("discoverPageImages uses shiny showdown fallback sprites for shiny variants", async () => {
	const images = await discoverPageImages("shiny-klinklang", async () => ({ query: { pages: {} } }));

	assert.deepEqual(images, {
		sprite: { url: "https://play.pokemonshowdown.com/sprites/gen5-shiny/klinklang.png" },
		hero: { url: "https://play.pokemonshowdown.com/sprites/gen5-shiny/klinklang.png" },
	});
});

test("discoverPageImages falls back to generated pokemon showdown sprite urls", async () => {
	const images = await discoverPageImages("smeargle-7", async () => ({ query: { pages: {} } }));

	assert.deepEqual(images, {
		sprite: { url: "https://play.pokemonshowdown.com/sprites/gen5/smeargle.png" },
		hero: { url: "https://play.pokemonshowdown.com/sprites/gen5/smeargle.png" },
	});
});

test("discoverPageImages normalizes apostrophe pokemon showdown slugs", async () => {
	const images = await discoverPageImages("sirfetch-d", async () => ({ query: { pages: {} } }));

	assert.deepEqual(images, {
		sprite: { url: "https://play.pokemonshowdown.com/sprites/gen5/sirfetchd.png" },
		hero: { url: "https://play.pokemonshowdown.com/sprites/gen5/sirfetchd.png" },
	});
});

test("extractLeadWikiImageUrl skips language flags and interface chrome", () => {
	const html = `
		<img src="/images/8/81/ES.png" alt="ES.png">
		<img src="/images/e/eb/EN.png" alt="EN.png">
		<img src="/images/a/aa/Spanish_Flag.png" alt="Spanish Flag">
		<img src="/images/thumb/8/80/Interface_Tank_PVE.png/24px-Interface_Tank_PVE.png" alt="Interface Tank PVE.png">
		<img src="/images/3/34/Banner_Daily-Gift.png" alt="Banner Daily Gift">
	`;

	assert.equal(
		extractLeadWikiImageUrl(html, "https://wiki.pokexgames.com/index.php/Daily_Gift", "sprite"),
		"https://wiki.pokexgames.com/images/3/34/Banner_Daily-Gift.png",
	);
});

// Showdown names a form as `species-<modifiers>`, modifiers concatenated with no separator. The
// old builder treated the first token as the only modifier and moved the rest to the front, which
// was right for one-word modifiers and wrong the moment there were two: "Galarian Zen Darmanitan"
// became `zen-darmanitan-galar`, a 404, and the sprite silently vanished from the app.
test("a two-word form folds both modifiers into one suffix", () => {
	assert.equal(showdownPokemonSlug("galarian-zen-darmanitan"), "darmanitan-galarzen");
});

test("mega X and Y move the letter into the suffix", () => {
	assert.equal(showdownPokemonSlug("mega-charizard-x"), "charizard-megax");
	assert.equal(showdownPokemonSlug("mega-charizard-y"), "charizard-megay");
});

test("single-word regional forms still work", () => {
	assert.equal(showdownPokemonSlug("alolan-ninetales"), "ninetales-alola");
	assert.equal(showdownPokemonSlug("hisuian-typhlosion"), "typhlosion-hisui");
});

// PokeXGames gives its megas an element suffix Showdown has no sprite for; the base mega is the
// right fallback rather than a broken image.
test("a PokeXGames element suffix on a mega falls back to the base mega", () => {
	assert.equal(showdownPokemonSlug("mega-altaria-dragon"), "altaria-mega");
	assert.equal(showdownPokemonSlug("mega-ampharos-electric"), "ampharos-mega");
});

// An element word is part of some real species names, so it must only be dropped for megas.
test("element words survive on species that genuinely carry them", () => {
	assert.equal(showdownPokemonSlug("rotom-wash"), "rotom-wash");
});

test("species whose Showdown name drops a separator are aliased", () => {
	assert.equal(showdownPokemonSlug("mr-mime"), "mrmime");
	assert.equal(showdownPokemonSlug("mime-jr"), "mimejr");
	assert.equal(showdownPokemonSlug("galarian-farfetch-d"), "farfetchd-galar");
});

test("shiny and TM qualifiers resolve to the base sprite", () => {
	assert.equal(showdownPokemonSlug("shiny-froslass"), "froslass");
	assert.equal(showdownPokemonSlug("shiny-charizard-tm"), "charizard");
});
