import test from "node:test";
import assert from "node:assert/strict";

import { extractArticleHtml, extractArticleWikiLinks } from "../lib/extract.mjs";
import {
	inferDiscoveredPageKind,
	isContentListHeading,
	isPokemonSectionSignature,
	looksLikePokemonDiscoveryCandidate,
	shouldRecurseDiscoveredPage,
	shouldSkipDiscoveredLink,
} from "../lib/discovery.mjs";
import { buildLocalizedText } from "../lib/shared.mjs";
import { loadFixture } from "./helpers.mjs";

test("discovery ignores content-list headings and keeps real boss-fight links", async () => {
	const html = await loadFixture("discovery-root.html");
	const articleHtml = extractArticleHtml(html);
	const links = extractArticleWikiLinks(articleHtml, "https://wiki.pokexgames.com/index.php/Boss_Fight");

	const entei = links.find((link) => link.title === "Entei");
	assert.ok(entei);
	assert.equal(shouldSkipDiscoveredLink({
		link: entei,
		parentEntry: { slug: "boss-fight", title: buildLocalizedText("Boss Fight") },
		rootEntry: { slug: "boss-fight" },
		seenSlugs: new Set(["boss-fight"]),
		excludeSlugs: new Set(),
		excludeTitles: new Set(),
	}), false);

	const indexLink = links.find((link) => link.title === "Should Not Appear");
	assert.ok(indexLink);
	assert.equal(shouldSkipDiscoveredLink({
		link: indexLink,
		parentEntry: { slug: "boss-fight", title: buildLocalizedText("Boss Fight") },
		rootEntry: { slug: "boss-fight" },
		seenSlugs: new Set(["boss-fight"]),
		excludeSlugs: new Set(),
		excludeTitles: new Set(),
	}), true);
});

test("discovery helper infers kinds and recursion policy correctly", () => {
	assert.equal(isContentListHeading("Índice"), true);
	assert.equal(isContentListHeading("Arena principal"), false);

	assert.equal(
		inferDiscoveredPageKind("", { headingPath: ["Workshop"] }, "Blacksmith Workshop"),
		"workshop",
	);

	assert.equal(
		inferDiscoveredPageKind("", { headingPath: ["Mapas"] }, "Johto Map"),
		"map",
	);

	assert.equal(
		shouldRecurseDiscoveredPage({ pageKind: "map", title: buildLocalizedText("Johto Map") }, 1),
		false,
	);

	assert.equal(
		shouldRecurseDiscoveredPage({ pageKind: "article", title: buildLocalizedText("Entei (EN)") }, 1),
		false,
	);

	assert.equal(
		shouldRecurseDiscoveredPage({ pageKind: "article", title: buildLocalizedText("Embedded Tower EN") }, 1),
		false,
	);

	assert.equal(
		shouldRecurseDiscoveredPage({ pageKind: "article", title: buildLocalizedText("Entei") }, 1),
		true,
	);
});

test("pokemon discovery helpers identify likely pokemon pages", () => {
	assert.equal(looksLikePokemonDiscoveryCandidate("Dragonite"), true);
	assert.equal(looksLikePokemonDiscoveryCandidate("Shiny Dragonite"), true);
	assert.equal(looksLikePokemonDiscoveryCandidate("Dragonite Bag"), false);
	assert.equal(looksLikePokemonDiscoveryCandidate("Arcade 2026"), false);

	assert.equal(isPokemonSectionSignature([
		{ line: "<b>Informações Gerais</b>" },
		{ line: "<b>Movimentos</b>" },
		{ line: "<b>Efetividades</b>" },
	]), true);

	assert.equal(isPokemonSectionSignature([
		{ line: "<b>Introdução</b>" },
		{ line: "<b>Recompensas</b>" },
	]), false);
});
