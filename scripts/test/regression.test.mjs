import test from "node:test";
import assert from "node:assert/strict";

import { buildSummary, extractArticleWikiLinks, extractSections } from "../lib/extract.mjs";
import { shouldRecurseDiscoveredPage } from "../lib/discovery.mjs";
import { buildLocalizedPageSummary, normalizeSections, resolveDisplayInList, resolveDisplayTitle, resolvePageGroup } from "../lib/page-pipeline.mjs";
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

test("boss text cleanup fixes repeated names, berry names, and accented entry items", () => {
	const importantInfo = publishSection(structureSection({
		id: "informacoes-importantes",
		heading: { [PT_BR]: "Informações importantes" },
		paragraphs: { [PT_BR]: [] },
		items: {
			[PT_BR]: [
				"A Berrie Lum berry não funciona nesta batalha.",
				"Berries recomendadas: Berrie 5.png Colbur Berry, Ganlon Beery e Ganlon berry.png Ganlon Berry.",
				"O Boss Giant Shiny Tentacruel Shiny Giant Tentacruel possui o elemento Water e Poison.",
			],
		},
		pageCategory: "boss-fight",
		slug: "boss-shiny-giant-tentacruel",
		title: buildLocalizedText("Boss Shiny Giant Tentacruel"),
	}));

	assert.deepEqual(importantInfo.bossSupport[PT_BR].bullets, [
		"A Lum Berry não funciona nesta batalha",
		"Berries recomendadas: Colbur Berry, Ganlon Berry e Ganlon Berry",
		"O Boss Shiny Giant Tentacruel possui o elemento Water e Poison",
	]);

	const difficulty = publishSection(structureSection({
		id: "dificuldades",
		heading: { [PT_BR]: "Dificuldades" },
		paragraphs: {
			[PT_BR]: [
				"Normal: requer no mínimo level 250; possui um level cap no level 275. Para entrar nesta dificuldade, é necessário que o jogador tenha 1 Talismã de Feitiço.",
			],
		},
		items: { [PT_BR]: [] },
		pageCategory: "boss-fight",
		slug: "lavender-s-curse",
		title: buildLocalizedText("Lavender's Curse"),
	}));

	assert.equal(difficulty.difficulties[PT_BR].entries[0].entryRequirement.name, "Talismã de Feitiço");
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

test("boss event introductions and summaries use cleaned full intro prose", () => {
	const sections = normalizeSections(extractSections(`
		<h2>Introdução</h2>
		<p>A Bowstoise Dungeon faz parte do Evento de Páscoa da PokeXGames. Os jogadores devem enfrentar o <img alt="SshBlastoise.png" src="/images/3/37/SshBlastoise.png" /> Bowser Blastoise no modo PokéView. É a oportunidade que os jogadores têm de tentar adquirir o <img alt="Bowser-costume.png" src="/images/d/d2/Bowser-costume.png" /> Bowser Costume, um addon muito raro para o <img alt="SshBlastoise.png" src="/images/3/37/SshBlastoise.png" /> Shiny Blastoise.</p>
	`, "Bowstoise Dungeon", "https://wiki.pokexgames.com/index.php/Bowstoise_Dungeon"), {
		category: "boss-fight",
		slug: "bowstoise-dungeon",
		pageKind: "dungeons",
	});

	const summary = buildLocalizedPageSummary(buildSummary([]), "Bowstoise Dungeon", sections);
	assert.equal(summary[PT_BR].includes(".png"), false);
	assert.match(summary[PT_BR], /Bowser Costume/);
	assert.match(summary[PT_BR], /Shiny Blastoise/);
});

test("boss event reward tabbers keep difficulty, quantity, name, and rarity separate", () => {
	const [section] = normalizeSections(extractSections(`
		<h2>Recompensas</h2>
		<div class="tabber">
			<article class="tabber__panel" data-title="Fácil">
				<table><tr><th>Item</th><th>Quantidade</th><th>Raridade</th></tr>
					<tr><td><img alt="Easter Tickets.png" src="/images/8/82/Easter_Tickets.png" /></td><td>35 Arcade Tickets</td><td>Comum</td></tr>
				</table>
			</article>
			<article class="tabber__panel" data-title="Elite">
				<table><tr><th>Item</th><th>Quantidade</th><th>Raridade</th></tr>
					<tr><td><img alt="Rough Gemstone.png" src="/images/1/1d/Rough_Gemstone.png" /></td><td>9 Rough Gemstone</td><td>Comum</td></tr>
				</table>
				<p><img alt="Improved XP2.png" src="/images/3/35/Improved_XP2.png" /> Improved XP: 70.000</p>
				<p><b>Observação</b>: O jogador receberá a Improved XP se for no mínimo level 600. Caso ele seja level menor que isso, receberá a experiência normal.</p>
			</article>
			<article class="tabber__panel" data-title="Ultimate">
				<table><tr><th>Item</th><th>Quantidade</th><th>Raridade</th></tr>
					<tr><td><img alt="Easter Tickets.png" src="/images/8/82/Easter_Tickets.png" /></td><td>175 Arcade Tickets</td><td>Comum</td></tr>
				</table>
			</article>
		</div>
	`, "Bowstoise Dungeon", "https://wiki.pokexgames.com/index.php/Bowstoise_Dungeon"), {
		category: "boss-fight",
		slug: "bowstoise-dungeon",
		pageKind: "dungeons",
	});

	const rewards = section.rewards[PT_BR];
	assert.deepEqual(rewards[0], { type: "loot", name: "Arcade Tickets", difficulty: "Fácil", rarity: "Comum", qty: "35" });
	assert(rewards.some((reward) => reward.name === "Rough Gemstone" && reward.difficulty === "Elite" && reward.qty === "9"));
	assert(rewards.some((reward) => reward.name === "Arcade Tickets" && reward.difficulty === "Ultimate" && reward.qty === "175"));
	assert.equal(rewards.some((reward) => /Elite|Ultimate|Caso|\|/.test(reward.name)), false);
});

test("tabber ability sections preserve trailing subsection prose and media", () => {
	const [section] = normalizeSections(extractSections(`
		<h2>Habilidades</h2>
		<div class="tabber">
			<article class="tabber__panel" data-title="Ember">
				<p>O King Charizard ataca o jogador.</p>
				<video src="https://wiki.pokexgames.com/images/2/27/King_Charizard_Ember.mp4"></video>
			</article>
		</div>
		<h3>Black Pawn Charmander</h3>
		<p>Quando o King Charizard chega a uma certa porcentagem de HP ele invocará dois Black Pawn Charmander, isso acontece duas vezes por combate.</p>
		<h3>Cura</h3>
		<p>Os jogadores podem curar a HP e remover o status BURN, pisando na água ao norte da arena como no video abaixo.</p>
		<video src="https://wiki.pokexgames.com/images/e/e8/King_Charizard_Cura.mp4"></video>
	`, "King Charizard Dungeon", "https://wiki.pokexgames.com/index.php/King_Charizard_Dungeon"), {
		category: "boss-fight",
		slug: "king-charizard-dungeon",
		pageKind: "dungeons",
	});

	assert.deepEqual(section.abilities[PT_BR].map((entry) => entry.name), ["Ember", "Black Pawn Charmander", "Cura"]);
	assert.equal(section.abilities[PT_BR][1].description[0].includes("Black Pawn Charmander"), true);
	assert.equal(section.media[PT_BR].some((item) => item.slug === "king-charizard-cura"), true);
});
