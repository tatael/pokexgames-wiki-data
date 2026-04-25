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

test("extractArticleFragmentHtml can match fragment text when heading id is missing", () => {
	const html = `
		<h2><span>Bronze Dungeons</span></h2>
		<p>Bronze block</p>
		<h2><span>Silver Dungeons</span></h2>
		<p>Silver block</p>
	`;
	const fragmentHtml = extractArticleFragmentHtml(html, "Bronze_Dungeons");

	assert.match(fragmentHtml, /Bronze block/);
	assert.doesNotMatch(fragmentHtml, /Silver block/);
});

test("extractArticleFragmentHtml supports top-level h1 wiki fragments", () => {
	const html = `
		<h1><span class="mw-headline" id="Bronze_Dungeons">Bronze Dungeons</span></h1>
		<p>Bronze block</p>
		<h1><span class="mw-headline" id="Silver_Dungeons">Silver Dungeons</span></h1>
		<p>Silver block</p>
	`;
	const fragmentHtml = extractArticleFragmentHtml(html, "Bronze_Dungeons");

	assert.match(fragmentHtml, /Bronze block/);
	assert.doesNotMatch(fragmentHtml, /Silver block/);
});

test("extractArticleFragmentHtml trims footer headings from final h1 fragments", () => {
	const html = `
		<h1><span class="mw-headline" id="Master_Dungeons">Master Dungeons</span></h1>
		<p>Master block</p>
		<center><a href="/index.php/DZ_Frozen_Master" title="DZ Frozen Master"><img alt="Lorelei.png" src="/images/d/d0/Lorelei.png" width="320" height="90" /></a></center>
		<div class="printfooter">Footer</div>
		<h2>Menu de navegação</h2>
		<p>Navigation block</p>
	`;
	const fragmentHtml = extractArticleFragmentHtml(html, "Master_Dungeons");
	const sections = extractSections(fragmentHtml, "Master Dungeons", "https://wiki.pokexgames.com/index.php/Spoiler_das_Masmorras#Master_Dungeons");

	assert.match(fragmentHtml, /Master block/);
	assert.doesNotMatch(fragmentHtml, /Menu de navegação/);
	assert.equal(sections[0].media["pt-BR"].length, 1);
	assert.equal(sections[0].media["pt-BR"][0].slug, "dz-frozen-master");
});

test("extractArticleFragmentHtml can target tabber articles by title fragments", () => {
	const html = `
		<article class="tabber__panel" data-title="Dorabelle"><p>Dorabelle block</p></article>
		<article class="tabber__panel" data-title="Giant Tyranitar"><p>Tyranitar block</p></article>
	`;
	const fragmentHtml = extractArticleFragmentHtml(html, "Giant_Tyranitar-1");

	assert.match(fragmentHtml, /Tyranitar block/);
	assert.doesNotMatch(fragmentHtml, /Dorabelle block/);
});

test("extractArticleWikiLinks preserves heading paths", async () => {
	const html = await loadFixture("discovery-root.html");
	const articleHtml = extractArticleHtml(html);
	const links = extractArticleWikiLinks(articleHtml, "https://wiki.pokexgames.com/index.php/Boss_Fight");
	const entei = links.find((link) => link.title === "Entei");

	assert.deepEqual(entei.headingPath, ["Boss Fight", "Arena"]);
});

test("extractArticleWikiLinks discovers quest spoiler entries from widget data", () => {
	const html = `
		<script>
		window.quests = window.quests || {};
		window.quests = [
			{"name":"Lost Elder","image":"/images/a/aa/Lost_Elder.png","level":80,"category":"Kanto","rewards":[],"link":"Lost_Elder_Quest"},
			{"name":"Crystal Cave","image":"/images/b/bb/Crystal_Cave.png","level":120,"category":"Johto","rewards":[]},
		]
		</script>
	`;
	const links = extractArticleWikiLinks(html, "https://wiki.pokexgames.com/index.php/Quests");

	assert.deepEqual(links.map((link) => link.title), ["Lost Elder Quest", "Crystal Cave"]);
	assert.deepEqual(links[0].headingPath, ["Kanto"]);
	assert.equal(links[0].url, "https://wiki.pokexgames.com/index.php/Lost_Elder_Quest");
});

test("extractSections falls back to h3 headings when h2 is only the wiki toc", () => {
	const sections = extractSections(`
		<h2>Índice</h2>
		<ul><li>1 Primeiros passos</li></ul>
		<h3>Primeiros passos</h3>
		<p>Texto inicial.</p>
		<h3>Lockpick</h3>
		<p>Texto do lockpick.</p>
	`, "Aventureiro");

	assert.deepEqual(sections.map((section) => section.id), ["primeiros-passos", "lockpick"]);
	assert.deepEqual(sections[0].paragraphs["pt-BR"], ["Texto inicial."]);
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
		<img src="/images/8/81/ES.png" alt="ES.png">
		<img src="/images/thumb/8/80/Interface_Tank_PVE.png/24px-Interface_Tank_PVE.png" alt="Interface Tank PVE.png">
		<img src="/images/3/34/Banner_Daily-Gift.png" alt="Banner Daily Gift" width="320" height="120">
	`;
	const sections = extractSections(html, "Teste", "https://wiki.pokexgames.com/index.php/Teste");

	assert.deepEqual(sections[0].media["pt-BR"], [
		{
			type: "image",
			url: "https://wiki.pokexgames.com/images/3/34/Banner_Daily-Gift.png",
			alt: "Banner Daily Gift",
			width: 320,
			height: 120,
		},
	]);
});

test("extractSections strips script and style bodies from fallback text", () => {
	const sections = extractSections(`
		<style>.broken { display: none; }</style>
		<script>const noisy = true;</script>
		<p>Visible copy.</p>
	`, "Nightmare Hunts");

	assert.deepEqual(sections[0].paragraphs["pt-BR"], ["Visible copy."]);
});

test("extractSections reads every tabber panel title and body", () => {
	const sections = extractSections(`
		<h2>Habilidades</h2>
		<div class="tabber">
			<article class="tabber__panel" data-title="Roar"><p>Primeira habilidade.<video src="/images/a/aa/Roar.mp4"></video></p></article>
			<article class="tabber__panel" data-title="Ember">Segunda habilidade.<video src="/images/a/ab/Ember.mp4"></video></article>
		</div>
	`, "Boss Fight - Entei", "https://wiki.pokexgames.com/index.php/Boss_Fight_-_Entei");

	assert.deepEqual(sections[0].paragraphs["pt-BR"], [
		"# Roar",
		"Primeira habilidade.",
		"# Ember",
		"Segunda habilidade.",
	]);
	assert.equal(sections[0].media["pt-BR"].length, 2);
});

test("extractSections uses wrapped wiki links as media navigation slugs", () => {
	const sections = extractSections(`
		<h1><span class="mw-headline" id="Bronze_Dungeons">Bronze Dungeons</span></h1>
		<a href="/index.php/DZ_Beartic" title="DZ Beartic"><img alt="Beartic.png" src="/images/thumb/b/b9/Beartic.png/320px-Beartic.png" width="320" height="91" /></a>
	`, "Bronze Dungeons", "https://wiki.pokexgames.com/index.php/Spoiler_das_Masmorras");

	assert.equal(sections[0].media["pt-BR"][0].slug, "dz-beartic");
});

test("extractSections preserves repeated capture-ball media inside possible captures", () => {
	const sections = extractSections(`
		<h2>Possíveis Capturas</h2>
		<table>
			<tr><td><img alt="225-Sh Delibird.png" src="/images/d/d0/225-Sh_Delibird.png"></td><td><img alt="Ultra-ball(1).png" src="/images/9/9b/Ultra-ball%281%29.png"></td><td><img alt="Sora-ball.png" src="/images/b/b9/Sora-ball.png"></td><td><img alt="Premier-ball(1).png" src="/images/e/e6/Premier-ball%281%29.png"></td></tr>
			<tr><td><img alt="613-Cubchoo.png" src="/images/b/bc/613-Cubchoo.png"></td><td><img alt="Ultra-ball(1).png" src="/images/9/9b/Ultra-ball%281%29.png"></td><td><img alt="Sora-ball.png" src="/images/b/b9/Sora-ball.png"></td><td><img alt="Premier-ball(1).png" src="/images/e/e6/Premier-ball%281%29.png"></td></tr>
			<tr><td><img alt="614-Beartic.png" src="/images/3/3e/614-Beartic.png"></td><td><img alt="Ultra-ball(1).png" src="/images/9/9b/Ultra-ball%281%29.png"></td><td><img alt="Sora-ball.png" src="/images/b/b9/Sora-ball.png"></td><td><img alt="Heavy-ball.png" src="/images/c/c5/Heavy-ball.png"></td><td><img alt="Premier-ball(1).png" src="/images/e/e6/Premier-ball%281%29.png"></td></tr>
		</table>
	`, "DZ Beartic", "https://wiki.pokexgames.com/index.php/DZ_Beartic");

	assert.equal(sections[0].media["pt-BR"].length, 13);
	assert.equal(sections[0].media["pt-BR"].filter((item) => item.alt === "Ultra-ball(1).png").length, 3);
});

test("extractArticleWikiLinks uses linked image alt text and single quoted hrefs", () => {
	const links = extractArticleWikiLinks(`
		<h2>Eventos</h2>
		<a href='/index.php/Lavender%27s_Curse'><img alt="Lavender's Curse" src="/images/a/aa/Lavender.png"></a>
	`, "https://wiki.pokexgames.com/index.php/Boss_Fight");

	assert.equal(links[0].title, "Lavender's Curse");
	assert.equal(links[0].label, "Lavender's Curse");
	assert.equal(links[0].hasImage, true);
	assert.deepEqual(links[0].headingPath, ["Eventos"]);
});
