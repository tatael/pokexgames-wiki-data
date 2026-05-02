import test from "node:test";
import assert from "node:assert/strict";

import { buildSummary, extractArticleWikiLinks, extractSections } from "../lib/extract.mjs";
import { shouldRecurseDiscoveredPage } from "../lib/discovery.mjs";
import { normalizeSections, resolveDisplayInList, resolveDisplayTitle, resolvePageGroup } from "../lib/page-pipeline.mjs";
import { structureSection } from "../lib/transform.mjs";
import { publishSection } from "../lib/transform/publish.mjs";
import { PT_BR, buildLocalizedText } from "../lib/shared.mjs";

test("linked image discovery uses target title instead of image filename", () => {
	const links = extractArticleWikiLinks(`
		<h2>Eventos</h2>
		<a href="/index.php/King_Charizard_Dungeon" title="King Charizard Dungeon"><img alt="Banner Bolinha King Charizard.png" src="/images/a/aa/Banner.png"></a>
	`, "https://wiki.pokexgames.com/index.php/Nightmare_Terror");

	assert.equal(links[0].title, "King Charizard Dungeon");
	assert.equal(links[0].label, "King Charizard Dungeon");
	assert.equal(links[0].hasImage, true);
});

test("media filename titles are cleaned before display", () => {
	assert.deepEqual(
		resolveDisplayTitle(buildLocalizedText("Banner Bolinha King Charizard.png"), buildLocalizedText("Boss Fight")),
		buildLocalizedText("King Charizard"),
	);
	assert.deepEqual(
		resolveDisplayTitle(buildLocalizedText("Totodile Png"), buildLocalizedText("Pokemon")),
		buildLocalizedText("Totodile"),
	);
});

test("boss fight overview is hidden and special children are grouped", () => {
	assert.equal(resolveDisplayInList({
		category: "boss-fight",
		slug: "boss-fight",
		title: buildLocalizedText("Boss Fight"),
		pageKind: "index",
		navigationPath: ["Boss Fight"],
	}), false);

	assert.equal(resolvePageGroup({
		category: "boss-fight",
		slug: "king-charizard-dungeon",
		title: buildLocalizedText("King Charizard Dungeon"),
		navigationPath: ["Boss Fight", "Nightmare Terror"],
	})[PT_BR], "Eventos");

	assert.equal(resolvePageGroup({
		category: "boss-fight",
		slug: "boss-shiny-giant-tentacruel",
		title: buildLocalizedText("Boss Shiny Giant Tentacruel"),
		navigationPath: ["Boss Fight", "Nightmare Terror"],
	})[PT_BR], "Outros");
});

test("repeated reward rows are deduplicated per difficulty", () => {
	const section = structureSection({
		id: "recompensas",
		heading: { [PT_BR]: "Recompensas" },
		paragraphs: { [PT_BR]: [] },
		items: {
			[PT_BR]: [
				"Normal",
				"Big Bulb.png | Giant Bulb | Raro",
				"Big Bulb.png | Giant Bulb | Raro",
				"TM Tank Aleatorio | TM Tank Aleatorio | Epico",
				"TM Tank Aleatorio | TM Tank Aleatorio | Epico",
			],
		},
	});

	assert.deepEqual(section.rewards[PT_BR].map((item) => item.name), ["Giant Bulb", "TM Tank Aleatorio"]);
});

test("boss detail pages are terminal discovery nodes", () => {
	assert.equal(shouldRecurseDiscoveredPage({
		pageKind: "boss",
		title: buildLocalizedText("Lavender's Curse"),
	}, 1), false);
});

test("special reward labels are difficulties, not loot", () => {
	const section = structureSection({
		id: "recompensas",
		heading: { [PT_BR]: "Recompensas" },
		paragraphs: { [PT_BR]: [] },
		items: {
			[PT_BR]: [
				"Gold",
				"Wool Ball.png | Wool Ball | Comum",
				"Nightmare",
				"Recipe T1H.png | Cosmic Addons Recipe | Epico",
				"Especialista",
				"Cursed Ghostly Hand.gif | Cursed Ghostly Hand | Comum",
				"HrnVNwK.png | Darknesss Stone | 9 a 11 | Comum",
			],
		},
	});

	const rewards = section.rewards[PT_BR];
	assert.equal(rewards.some((item) => ["Gold", "Nightmare", "Especialista"].includes(item.name)), false);
	assert.deepEqual(rewards.map((item) => item.name), ["Wool Ball", "Cosmic Addons Recipe", "Cursed Ghostly Hand", "Darkness Stone"]);
	assert.deepEqual(rewards.map((item) => item.difficulty), ["Gold", "Nightmare", "Especialista", "Especialista"]);
});

test("labeled boss reward experience rows are parsed as loot", () => {
	const section = structureSection({
		id: "recompensas",
		heading: { [PT_BR]: "Recompensas" },
		paragraphs: { [PT_BR]: [] },
		items: {
			[PT_BR]: [
				"Normal",
				"Exp icon.png Experiência: 1.500.000",
				"Improved XP2.png Improved XP: 90.000",
				"Exp icon nw.png Experiência: 6.000",
			],
		},
	});

	assert.deepEqual(section.rewards[PT_BR].map((item) => [item.name, item.qty, item.difficulty]), [
		["Experiência", "1.500.000", "Normal"],
		["Improved XP", "90.000", "Normal"],
		["Nightmare Experience", "6.000", "Normal"],
	]);
});

test("extractSections keeps h1 wiki sections and reward text outside tabber tables", () => {
	const sections = extractSections(`
		<h1 id="firstHeading">Boss Shiny Giant Tentacruel</h1>
		<h2>Índice</h2>
		<h1>Introdução</h1>
		<p>Texto de introdução.</p>
		<h1>Recompensas</h1>
		<article data-title="Normal">
			<table><tr><th>Item</th><th>Raridade</th></tr><tr><td>Echo Shard.gif</td><td>Comum</td></tr></table>
			<p><img alt="Exp icon.png" src="/images/e.png"> Experiência: 1.500.000</p>
			<p><img alt="Improved XP2.png" src="/images/i.png"> Improved XP: 90.000</p>
		</article>
	`, "Boss Shiny Giant Tentacruel", "https://wiki.pokexgames.com/index.php/Boss_Shiny_Giant_Tentacruel");

	assert.deepEqual(sections.map((section) => section.id), ["indice", "introducao", "recompensas"]);
	assert.ok(sections.find((section) => section.id === "recompensas").items[PT_BR].some((item) => item.includes("Experiência: 1.500.000")));
});

test("summaries prefer the complete first sentence over a cropped first clause", () => {
	const summary = buildSummary([{
		paragraphs: {
			[PT_BR]: [
				"A dungeon do Shiny Giant Tentacruel é de suma importância para jogadores que desejam adquirir um dos Alolan Pokémon provenientes do Alolan Egg, obtido em determinada etapa da The Chosen One Quest.",
			],
		},
	}]);

	assert.equal(summary[PT_BR].endsWith("The Chosen One Quest."), true);
});

test("small reward thumbnails are recovered as original media files", () => {
	const sections = extractSections(`
		<h1>Recompensas</h1>
		<table><tr><td><img alt="10.000 carat emerald.png" src="/images/thumb/0/05/10.000_carat_emerald.png/30px-10.000_carat_emerald.png" width="30" /></td><td>10.000 Carat Emerald</td></tr></table>
	`, "Rewards", "https://wiki.pokexgames.com/index.php/Boss_Shiny_Giant_Tentacruel");
	const media = sections[0].media[PT_BR];

	assert.equal(media[0].url, "https://wiki.pokexgames.com/images/0/05/10.000_carat_emerald.png");
});

test("extractSections keeps center media markers in paragraph order", () => {
	const sections = extractSections(`
		<h1>Localizacao</h1>
		<p>Texto antes <img alt="Orb.gif" src="/images/0/0a/Orb.gif" /> Orb.</p>
		<center><img alt="Mapa A.png" src="/images/a/aa/Mapa_A.png" /> <img alt="Mapa B.png" src="/images/b/bb/Mapa_B.png" /></center>
		<p>Texto depois.</p>
	`, "Boss Shiny Giant Tentacruel", "https://wiki.pokexgames.com/index.php/Boss_Shiny_Giant_Tentacruel");

	assert.deepEqual(sections[0].paragraphs[PT_BR], [
		"Texto antes Orb.gif Orb.",
		"Mapa A.png Mapa B.png",
		"Texto depois.",
	]);
});

test("extractSections keeps tabber center media between mechanic paragraphs", () => {
	const sections = extractSections(`
		<h1>Batalha contra o boss</h1>
		<h2>Mecanicas</h2>
		<article data-title="Inicio">
			<p>Texto antes.</p>
			<center><img alt="Localizacao bau.png" src="/images/6/6c/Localizacao_bau.png" /> <img alt="Bau cruel.png" src="/images/8/80/Bau_cruel.png" /></center>
			Texto solto depois.
		</article>
	`, "Boss Shiny Giant Tentacruel", "https://wiki.pokexgames.com/index.php/Boss_Shiny_Giant_Tentacruel");
	const mechanics = sections.find((section) => section.id === "mecanicas");

	assert.deepEqual(mechanics.paragraphs[PT_BR], [
		"# Inicio",
		"Texto antes.",
		"Localizacao bau.png Bau cruel.png",
		"Texto solto depois.",
	]);
});

test("extractSections keeps meaningful PvE interface role icons", () => {
	const sections = extractSections(`
		<h1>Mecânicas</h1>
		<p>Utilize Pokémon da categoria <img alt="Interface Tank PVE.png" src="/images/thumb/8/80/Interface_Tank_PVE.png/20px-Interface_Tank_PVE.png" /> Tanque - PVE.</p>
	`, "Boss Shiny Giant Tentacruel", "https://wiki.pokexgames.com/index.php/Boss_Shiny_Giant_Tentacruel");

	assert.equal(sections[0].paragraphs[PT_BR][0], "Utilize Pokémon da categoria Interface Tank PVE.png Tanque - PVE.");
	assert.deepEqual(sections[0].media[PT_BR].map((item) => item.alt), ["Interface Tank PVE.png"]);
	assert.equal(sections[0].media[PT_BR][0].url, "https://wiki.pokexgames.com/images/8/80/Interface_Tank_PVE.png");
});

test("Boss Shiny Giant Tentacruel keeps lead requirements and rewards", () => {
	const sections = normalizeSections([{
		id: "recompensas",
		heading: { [PT_BR]: "Recompensas" },
		paragraphs: { [PT_BR]: [] },
		items: { [PT_BR]: ["Itens Dropáveis", "Páginas que usam a etiqueta Tabber do analisador sintático"] },
		media: { [PT_BR]: [] },
	}], {
		category: "boss-fight",
		slug: "boss-shiny-giant-tentacruel",
		pageKind: "boss",
	});

	assert.equal(sections[0].id, "requisitos");
	const rewards = sections.find((section) => section.id === "recompensas").rewards[PT_BR];
	assert.deepEqual(rewards.map((reward) => reward.name).slice(0, 2), ["Emerald Loot Bag", "Carat Emerald"]);
	assert.equal(rewards[1].qty, "10.000");
	assert.equal(rewards.some((reward) => reward.name === "Itens Dropáveis"), false);
	assert.equal(rewards.some((reward) => reward.name.includes("Tabber")), false);
});

test("structured reward sections do not publish raw prose mirrors", () => {
	const section = publishSection(structureSection({
		id: "recompensas",
		heading: { [PT_BR]: "Recompensas" },
		paragraphs: { [PT_BR]: ["Emerald Loot Bag Itens Dropáveis Experiência: 1.000.000"] },
		items: { [PT_BR]: ["Emerald loot bag.png | Emerald Loot Bag", "Experiência: 1.000.000"] },
		media: { [PT_BR]: [] },
		pageCategory: "boss-fight",
		slug: "boss-shiny-giant-tentacruel",
		title: buildLocalizedText("Boss Shiny Giant Tentacruel"),
	}));

	assert.equal(section.kind, "rewards");
	assert.equal(section.content, undefined);
	assert.deepEqual(section.rewards[PT_BR].map((reward) => reward.name), ["Emerald Loot Bag", "Experiência"]);
});

test("Boss Shiny Giant Tentacruel recommendations publish Pokemon cards payload only", () => {
	const section = publishSection(structureSection({
		id: "recomendacoes",
		heading: { [PT_BR]: "Recomendações" },
		paragraphs: { [PT_BR]: [] },
		items: {
			[PT_BR]: [
				"O 095-CrystalOnix.png Crystal Onix é útil.",
				"Use 201-UnownLegion.png Unown Legion, S.klinklang.png Shiny Klinklang, 356-Dusclops.png Dusclops e 196-shEspeon.png Shiny Espeon.",
			],
		},
		media: {
			[PT_BR]: [
				{ type: "image", url: "https://wiki.pokexgames.com/images/1/11/095-CrystalOnix.png", alt: "095-CrystalOnix.png", slug: "crystal-onix" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/f/fd/201-UnownLegion.png", alt: "201-UnownLegion.png", slug: "unown-legion" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/6/68/S.klinklang.png", alt: "S.klinklang.png", slug: "shiny-klinklang" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/d/d0/356-Dusclops.png", alt: "356-Dusclops.png", slug: "dusclops" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/4/41/196-shEspeon.png", alt: "196-shEspeon.png", slug: "shiny-espeon" },
			],
		},
		pageCategory: "boss-fight",
		slug: "boss-shiny-giant-tentacruel",
		title: buildLocalizedText("Boss Shiny Giant Tentacruel"),
	}));

	assert.equal(section.bossSupport, undefined);
	assert.deepEqual(section.bossRecommendations[PT_BR].groups[0].pokemon, [
		"Crystal Onix",
		"Unown Legion",
		"Shiny Klinklang",
		"Dusclops",
		"Shiny Espeon",
	]);
});

test("boss structured sections strip role and sprite filenames", () => {
	const difficulty = publishSection(structureSection({
		id: "dificuldades",
		heading: { [PT_BR]: "Dificuldades" },
		paragraphs: {
			[PT_BR]: [
				"Pokeball.png Normal: requer no minimo nivel 250 e possui um level cap no nivel 275. Para entrar nesta dificuldade, e necessario que o jogador tenha 1 BossFightRaiz Enteicharm.png Entei Charm.",
			],
		},
		items: { [PT_BR]: [] },
		pageCategory: "boss-fight",
	}));

	assert.equal(difficulty.difficulties[PT_BR].entries[0].name, "Normal");
	assert.equal(difficulty.difficulties[PT_BR].entries[0].entryRequirement.name, "Entei Charm");
	assert.equal(difficulty.difficulties[PT_BR].entries[0].description.includes(".png"), false);

	const recommendations = publishSection(structureSection({
		id: "pokemon-recomendados",
		heading: { [PT_BR]: "Pokemon recomendados" },
		paragraphs: {
			[PT_BR]: [
				"# Interface Tank PVE.png Tanque",
				"Tanque 0009-Blastoise.png Blastoise 095-Onix.png Big Onix",
				"# Interface OTDD PVE.png Causador de Dano",
				"Causador de Dano Shiny golduck.png Shiny Golduck 028-Shiny Sandslash.png Shiny Sandslash 130-RedGyarados.png Shiny Gyarados Shiny steelix.png Golden Steelix 171-shLanturn.png Shiny Lanturn",
				"# Interface SupportOT PVE.png Suporte Contínuo",
				"Suporte Contínuo 201-UnownLegion.png Unown Legion",
			],
		},
		items: { [PT_BR]: [] },
		pageCategory: "boss-fight",
	}));

	assert.deepEqual(recommendations.bossRecommendations[PT_BR].groups.map((group) => group.label), ["Tanque", "Causador de Dano", "Suporte Contínuo"]);
	assert.deepEqual(recommendations.bossRecommendations[PT_BR].groups[0].pokemon, ["Blastoise", "Big Onix"]);
	assert.deepEqual(recommendations.bossRecommendations[PT_BR].groups[1].pokemon, ["Shiny Golduck", "Shiny Sandslash", "Shiny Gyarados", "Golden Steelix", "Shiny Lanturn"]);
	assert.deepEqual(recommendations.bossRecommendations[PT_BR].groups[2].pokemon, ["Unown Legion"]);
	assert.equal(JSON.stringify(recommendations.bossRecommendations[PT_BR]).includes(".png"), false);

	const intro = publishSection(structureSection({
		id: "introducao",
		heading: { [PT_BR]: "Introdução" },
		paragraphs: { [PT_BR]: ["O 244-Entei.png Entei foi criado pelo 250-Ho-Oh.png Ho-Oh e é do tipo Fire.png Fogo."] },
		items: { [PT_BR]: [] },
		pageCategory: "boss-fight",
	}));

	assert.equal(intro.content[PT_BR].paragraphs[0].includes(".png"), false);
	assert.match(intro.content[PT_BR].paragraphs[0], /Entei/);
	assert.match(intro.content[PT_BR].paragraphs[0], /Ho-Oh/);
});

test("ability-prefixed sections render as info cards", () => {
	const section = structureSection({
		id: "habilidades-do-meowth-fight-the-bite",
		heading: { [PT_BR]: "Habilidades do Meowth Fight-the-Bite" },
		paragraphs: { [PT_BR]: ["Rocket Glove"] },
		items: { [PT_BR]: [] },
	});

	assert.equal(section.kind, "info");
});
