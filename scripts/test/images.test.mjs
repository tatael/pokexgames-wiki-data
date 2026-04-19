import test from "node:test";
import assert from "node:assert/strict";

import { extractPageImagesFromUrls } from "../lib/images.mjs";

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
