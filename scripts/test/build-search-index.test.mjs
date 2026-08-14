import test from "node:test";
import assert from "node:assert/strict";

import { buildSearchIndex, tokenizeSearchText } from "../lib/build-search-index.mjs";

const PAGES = [
	{
		slug: "dratini",
		page: {
			title: { "pt-BR": "Dratini" },
			summary: { "pt-BR": "Um Pokémon do tipo Dragon." },
			sections: [{ title: { "pt-BR": "Localização" }, content: { "pt-BR": { paragraphs: ["Encontrado em Dragon Sky."] } } }],
		},
	},
	{
		slug: "npc-heather",
		page: {
			title: { "pt-BR": "NPC Heather" },
			summary: { "pt-BR": "Vendedora." },
			// The mention lives inside a typed payload, not prose — this is exactly the
			// class of hit the old summary search could never reach.
			sections: [{ pokemon: { "pt-BR": [{ name: "Dratini" }] } }],
		},
	},
];

test("a hyphenated name is indexed as its parts and as the joined word", () => {
	// The bare "x" is below the minimum token length, so the joined form is what makes
	// "X-Lucky" findable as itself rather than as "lucky" anywhere.
	assert.deepEqual(tokenizeSearchText("X-Lucky"), ["lucky", "xlucky"]);
	assert.deepEqual(tokenizeSearchText("Master Ball"), ["master", "ball"]);
});

test("accents are folded so a query without them still matches", () => {
	assert.deepEqual(tokenizeSearchText("Localização"), ["localizacao"]);
});

test("a term in the title outweighs the same term in the body", () => {
	const index = buildSearchIndex(PAGES);
	const postings = index.tokens.dratini.split(",");
	assert.equal(postings.length, 2, "both pages are indexed");
	assert.ok(postings.includes("0:8"), "the page it is about carries the title weight");
	assert.ok(postings.includes("1"), "the page that mentions it carries the body weight");
});

test("strings buried in typed payloads are indexed", () => {
	const index = buildSearchIndex(PAGES);
	assert.ok(index.tokens.dratini.includes("1"), "a roster entry counts as a mention");
});

test("terms on nearly every page are dropped and reported as common", () => {
	const many = Array.from({ length: 200 }, (_, i) => ({
		slug: `p${i}`,
		page: { title: { "pt-BR": `Página ${i}` }, sections: [{ content: { "pt-BR": { paragraphs: ["ubiquo"] } } }] },
	}));
	const index = buildSearchIndex(many);
	assert.equal(index.tokens.ubiquo, undefined, "not indexed");
	assert.ok(index.common.includes("ubiquo"), "but published so the client can ignore it rather than fail");
});

test("the index only references pages it actually holds", () => {
	const index = buildSearchIndex(PAGES);
	for (const packed of Object.values(index.tokens)) {
		for (const entry of packed.split(",")) {
			const pageIndex = Number(entry.split(":")[0]);
			assert.ok(index.slugs[pageIndex], `posting ${entry} points at a real page`);
		}
	}
});
