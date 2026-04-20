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

test("extractSections ignores wiki language flags and interface icons as media", () => {
	const html = `
		<h2>Introdução</h2>
		<p>Texto.</p>
		<img src="/images/a/aa/Spanish_Flag.png" alt="Spanish Flag">
		<img src="/images/thumb/8/80/Interface_Tank_PVE.png/24px-Interface_Tank_PVE.png" alt="Interface Tank PVE.png">
		<img src="/images/3/34/Banner_Daily-Gift.png" alt="Banner Daily Gift">
	`;
	const sections = extractSections(html, "Teste", "https://wiki.pokexgames.com/index.php/Teste");

	assert.deepEqual(sections[0].media["pt-BR"], [
		{
			type: "image",
			url: "https://wiki.pokexgames.com/images/3/34/Banner_Daily-Gift.png",
			alt: "Banner Daily Gift",
		},
	]);
});
