import test from "node:test";
import assert from "node:assert/strict";

import {
	buildSummary,
	extractArticleFragmentHtml,
	extractArticleHtml,
	extractArticleWikiLinks,
	extractSections,
} from "../lib/extract.mjs";
import { loadFixture } from "./helpers.mjs";

test("extractArticleFragmentHtml keeps only the requested heading block", async () => {
	const html = await loadFixture("fragmented-page.html");
	const articleHtml = extractArticleHtml(html);
	const fragmentHtml = extractArticleFragmentHtml(articleHtml, "Informações_Gerais");

	assert.match(fragmentHtml, /Wanted block/);
	assert.match(fragmentHtml, /Still wanted/);
	assert.doesNotMatch(fragmentHtml, /Not wanted/);
});

test("extractArticleWikiLinks preserves heading paths", async () => {
	const html = await loadFixture("discovery-root.html");
	const articleHtml = extractArticleHtml(html);
	const links = extractArticleWikiLinks(articleHtml, "https://wiki.pokexgames.com/index.php/Boss_Fight");
	const entei = links.find((link) => link.title === "Entei");

	assert.deepEqual(entei.headingPath, ["Boss Fight", "Arena"]);
});

test("extractSections and buildSummary shape a pokemon page into readable blocks", async () => {
	const html = await loadFixture("pokemon-page.html");
	const articleHtml = extractArticleHtml(html);
	const sections = extractSections(articleHtml, "Absol");

	assert.deepEqual(sections.map((section) => section.id), [
		"informacoes-gerais",
		"movimentos",
		"efetividade",
		"outras-versoes",
	]);

	assert.match(buildSummary(sections)["pt-BR"], /Nome: Absol/);
});
