import test from "node:test";
import assert from "node:assert/strict";

import { discoverPageImages, extractLeadWikiImageUrl, extractPageImagesFromUrls } from "../lib/images.mjs";

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

test("discoverPageImages falls back to generated pokemon showdown sprite urls", async () => {
	const images = await discoverPageImages("smeargle-7", async () => ({ query: { pages: {} } }));

	assert.deepEqual(images, {
		sprite: { url: "https://play.pokemonshowdown.com/sprites/gen5/smeargle.png" },
		hero: { url: "https://play.pokemonshowdown.com/sprites/gen5/smeargle.png" },
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
