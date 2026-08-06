import test from "node:test";
import assert from "node:assert/strict";

import { cmsEntriesAsLinks, extractCmsListEntries } from "../lib/extract-cms-list.mjs";

function page(list) {
	return `<h2>Mystery Dungeons</h2><script>
	const imageList = /* CMS_DATA_START */ ${JSON.stringify(list)};
	</script>`;
}

const LIST = {
	"Battle Tree House": { imageUrl: "https://wiki/x.webp", type: "azul", alias: [], wikiLink: "Battle Tree House" },
	"Below Zero": { imageUrl: "https://wiki/y.webp", type: "vermelha", alias: [], wikiLink: "Below Zero" },
	"Celebi - Wood (Suicune)": { imageUrl: "https://wiki/z.webp", type: "vermelha", alias: [], wikiLink: "%3F%3F%3F" },
};

test("widget-driven index children are read out of the CMS blob", () => {
	const entries = extractCmsListEntries(page(LIST));

	// The "???" placeholder marks an unrevealed page and must not become a child.
	assert.deepEqual(entries.map((entry) => entry.name), ["Battle Tree House", "Below Zero"]);
	assert.equal(entries[0].type, "azul");
	assert.equal(entries[1].type, "vermelha");
});

test("CMS entries become links discovery can filter like any other", () => {
	const links = cmsEntriesAsLinks(page(LIST), "https://wiki.pokexgames.com/index.php/Mystery_Dungeons");

	assert.equal(links.length, 2);
	assert.equal(links[0].title, "Battle Tree House");
	assert.equal(links[0].url, "https://wiki.pokexgames.com/index.php/Battle_Tree_House");
	assert.equal(links[0].hasImage, true);
	assert.deepEqual(links[0].headingPath, []);
});

test("pages without a CMS blob yield nothing", () => {
	assert.deepEqual(extractCmsListEntries("<p>nada</p>"), []);
	assert.deepEqual(extractCmsListEntries(""), []);
	assert.deepEqual(cmsEntriesAsLinks("<p>nada</p>", "https://wiki.pokexgames.com/"), []);
});

test("a malformed CMS blob is ignored rather than throwing", () => {
	assert.deepEqual(extractCmsListEntries("<script>/* CMS_DATA_START */ { broken </script>"), []);
});
