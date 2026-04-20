import test from "node:test";
import assert from "node:assert/strict";

import { discoverPageImages, extractPageImagesFromUrls } from "../lib/images.mjs";

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
