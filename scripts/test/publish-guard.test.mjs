import test from "node:test";
import assert from "node:assert/strict";

import { evaluatePublishGuard, pageUrlPath, summarizeBundle } from "../lib/publish-guard.mjs";

function bundle(pages) {
	return summarizeBundle({ schemaVersion: 2, pages });
}

function pagesFor(spec) {
	const pages = [];
	for (const [category, count] of Object.entries(spec)) {
		for (let index = 0; index < count; index += 1) {
			pages.push({ category, slug: `${category}-${index}` });
		}
	}

	return pages;
}

test("summarizeBundle counts pages per category", () => {
	const summary = bundle(pagesFor({ quests: 3, pokemon: 2 }));
	assert.equal(summary.pageCount, 5);
	assert.equal(summary.categories.get("quests"), 3);
	assert.equal(summary.categories.get("pokemon"), 2);
});

test("a bundle that grows publishes", () => {
	const result = evaluatePublishGuard({
		built: bundle(pagesFor({ quests: 120, pokemon: 1200 })),
		live: bundle(pagesFor({ quests: 100, pokemon: 1000 })),
	});

	assert.equal(result.ok, true);
	assert.deepEqual(result.blocking, []);
});

test("a small shrink inside the ratio still publishes", () => {
	const result = evaluatePublishGuard({
		built: bundle(pagesFor({ quests: 96, pokemon: 1000 })),
		live: bundle(pagesFor({ quests: 100, pokemon: 1000 })),
	});

	assert.equal(result.ok, true);
});

test("a collapse below the ratio blocks", () => {
	const result = evaluatePublishGuard({
		built: bundle(pagesFor({ quests: 50, pokemon: 400 })),
		live: bundle(pagesFor({ quests: 100, pokemon: 1000 })),
	});

	assert.equal(result.ok, false);
	assert.match(result.blocking.join(" "), /page count fell from 1100 to 450/);
});

// The failure mode this project actually keeps hitting: the wiki moves one category's data
// into a JS widget, that category empties, and the total barely moves.
test("a category emptying blocks even when the total is healthy", () => {
	const result = evaluatePublishGuard({
		built: bundle(pagesFor({ quests: 0, pokemon: 1105 })),
		live: bundle(pagesFor({ quests: 100, pokemon: 1000 })),
	});

	assert.equal(result.ok, false);
	assert.match(result.blocking.join(" "), /category "quests" lost all 100 of its pages/);
});

test("a new category does not block", () => {
	const result = evaluatePublishGuard({
		built: bundle(pagesFor({ quests: 100, pokemon: 1000, events: 40 })),
		live: bundle(pagesFor({ quests: 100, pokemon: 1000 })),
	});

	assert.equal(result.ok, true);
});

test("an empty build always blocks", () => {
	const result = evaluatePublishGuard({ built: bundle([]), live: bundle(pagesFor({ quests: 100 })) });

	assert.equal(result.ok, false);
	assert.match(result.blocking.join(" "), /no pages/);
});

// Without this the very first publish could never happen: there is nothing to compare to.
test("no live baseline warns but publishes", () => {
	const result = evaluatePublishGuard({ built: bundle(pagesFor({ quests: 100 })), live: null });

	assert.equal(result.ok, true);
	assert.match(result.warnings.join(" "), /no published bundle to compare against/);
});

test("an empty build blocks even with no baseline", () => {
	const result = evaluatePublishGuard({ built: bundle([]), live: null });

	assert.equal(result.ok, false);
});

test("force publishes past a block and records why", () => {
	const result = evaluatePublishGuard({
		built: bundle(pagesFor({ quests: 10 })),
		live: bundle(pagesFor({ quests: 100 })),
		force: true,
	});

	assert.equal(result.ok, true);
	assert.deepEqual(result.blocking, []);
	assert.match(result.warnings.join(" "), /forced past: page count fell/);
});

// The first successful publish deployed a perfectly good bundle and then failed its own smoke
// check, because manifest pagePath values are relative to pages/ while asset paths are relative
// to the bundle root. The overlay encodes the same split in src-tauri/src/wiki/http.rs.
test("page paths are resolved under pages/, asset paths are not", () => {
	assert.equal(pageUrlPath("boss-fight/boss-fight.json"), "pages/boss-fight/boss-fight.json");
	assert.equal(pageUrlPath("/clans/volcanic.json"), "pages/clans/volcanic.json");
});

test("a pagePath that already carries the prefix is not doubled", () => {
	assert.equal(pageUrlPath("pages/clans/volcanic.json"), "pages/clans/volcanic.json");
});

// The 2026-08-16 loss: two items hub pages were claimed by another seed's crawl and took all 48
// of their children with them. Items fell 451 -> 364 while the bundle overall lost only 3%, so
// the total-page floor never fired.
test("a category collapsing blocks even when the bundle total looks healthy", () => {
	const result = evaluatePublishGuard({
		built: bundle(pagesFor({ items: 364, pokemon: 1191, quests: 248 })),
		live: bundle(pagesFor({ items: 451, pokemon: 1191, quests: 248 })),
	});

	assert.equal(result.ok, false);
	assert.match(result.blocking.join(" "), /category "items" fell from 451 to 364/);
});

test("ordinary churn inside a category still publishes", () => {
	const result = evaluatePublishGuard({
		built: bundle(pagesFor({ items: 440, pokemon: 1191 })),
		live: bundle(pagesFor({ items: 451, pokemon: 1191 })),
	});

	assert.equal(result.ok, true);
});

// A category of five moves by whole pages; a ratio there would block on normal editing.
test("small categories are not ratio-checked", () => {
	const result = evaluatePublishGuard({
		built: bundle(pagesFor({ tools: 3, pokemon: 1191 })),
		live: bundle(pagesFor({ tools: 6, pokemon: 1191 })),
	});

	assert.equal(result.ok, true);
});
