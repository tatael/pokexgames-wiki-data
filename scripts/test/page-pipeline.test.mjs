import test from "node:test";
import assert from "node:assert/strict";

import {
	buildLocalizedSummary,
	normalizeSections,
	resolveCategory,
	resolveCategoryLabel,
	resolveDisplayTitle,
	resolveDisplayInList,
	resolvePageGroup,
	resolveTitleOverride,
	resolveSortRank,
} from "../lib/page-pipeline.mjs";
import { extractSections } from "../lib/extract.mjs";
import { PT_BR, buildLocalizedText, buildPagePath, decodeHtmlEntities } from "../lib/shared.mjs";

test("resolveCategory routes normalized wiki pages to their source categories", () => {
	assert.equal(resolveCategory("items", "daily-kill", null, {
		title: buildLocalizedText("Daily Kill"),
		navigationPath: ["Itens", "Mochilas", "Mochilas de Quest"],
		pageKind: "item",
	}), "daily-missions");

	assert.equal(resolveCategory("items", "christmas-defender-granbull", null, {
		title: buildLocalizedText("Christmas Defender Granbull"),
		navigationPath: ["Itens", "Mochilas", "Mochilas de Eventos"],
		pageKind: "item",
	}), "events");

	assert.equal(resolveCategory("items", "dz-giant-onix", null, {
		title: buildLocalizedText("DZ Giant Onix"),
		navigationPath: ["Itens", "Mochilas"],
		pageKind: "item",
	}), "dimensional-zone");

	assert.equal(resolveCategory("ultra-lab", "dz-shiny-giant-magikarp", null, {
		title: buildLocalizedText("DZ Shiny Giant Magikarp"),
		navigationPath: ["Ultra Lab", "Sarkies Quest", "O Traidor", "DZ Shiny Giant Magikarp"],
		pageKind: "lab",
	}), "dimensional-zone");

	assert.equal(resolveCategory("items", "aggron", { [PT_BR]: { name: "Aggron" } }, {
		title: buildLocalizedText("Aggron"),
		pageKind: "item",
	}), "pokemon");

	assert.equal(resolveCategory("mystery-dungeons", "mystery-dungeon-the-darkness", null, {
		title: buildLocalizedText("Mystery Dungeon - The Darkness"),
		pageKind: "dungeons",
	}), "mystery-dungeons");

	assert.equal(resolveCategory("items", "the-chosen-one-quest", null, {
		title: buildLocalizedText("The Chosen One Quest"),
		navigationPath: ["Itens", "Mochilas", "Mochilas de Quest"],
		pageKind: "quest",
	}), "quests");

	assert.equal(resolveCategory("items", "ditto-backpack", null, {
		title: buildLocalizedText("Ditto Backpack"),
		navigationPath: ["Itens", "Mochilas", "Mochilas de Quest"],
		pageKind: "quest",
	}), "items");

	assert.equal(resolveCategory("systems", "pokepark", null, {
		title: buildLocalizedText("PokéPark"),
		navigationPath: ["Sistemas", "PokéPark"],
		pageKind: "system",
	}), "events");
});

test("buildLocalizedSummary replaces the generic local-sync placeholder", () => {
	assert.deepEqual(
		buildLocalizedSummary({ [PT_BR]: "ConteÃºdo local sincronizado da wiki." }, "Daily Kill"),
		{ [PT_BR]: "Daily Kill", en: "Daily Kill", es: "Daily Kill" },
	);
});

test("resolveCategoryLabel keeps normalized categories distinct", () => {
	assert.equal(resolveCategoryLabel("dimensional-zone", buildLocalizedText("Itens"))[PT_BR], "Dimensional Zone");
});

test("decodeHtmlEntities normalizes numeric and accented title entities", () => {
	assert.equal(decodeHtmlEntities("Dorabelle&#039;s Wrath &amp; Benef&iacute;cios"), "Dorabelle's Wrath & Benefícios");
});

test("resolveDisplayInList hides aliases and non-card pages from category lists", () => {
	assert.equal(resolveDisplayInList({
		category: "nightmare-world",
		slug: "beneficios-vip-esp",
		title: buildLocalizedText("BenefÃ­cios VIP (ESP)"),
		pageKind: "system",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "professions",
		slug: "aventureiro",
		title: buildLocalizedText("Aventureiro"),
		pageKind: "profession",
	}), true);

	assert.equal(resolveDisplayInList({
		category: "dimensional-zone",
		slug: "dz-ambipom",
		title: buildLocalizedText("DZ Ambipom"),
		pageKind: "zone",
	}), true);

	assert.equal(resolveDisplayInList({
		category: "dimensional-zone",
		slug: "bronze-dungeons",
		title: buildLocalizedText("Bronze Dungeons"),
		pageKind: "zone",
	}), true);

	assert.equal(resolveDisplayInList({
		category: "professions",
		slug: "researcher",
		title: buildLocalizedText("Researcher"),
		pageKind: "profession",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "npcs",
		slug: "dimensional-mountain-quest",
		title: buildLocalizedText("Dimensional Mountain Quest"),
		pageKind: "npc",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "nightmare-world",
		slug: "beneficios-vip",
		title: buildLocalizedText("BenefÃ­cios VIP"),
		pageKind: "nightmare",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "nightmare-world",
		slug: "subject-14",
		title: buildLocalizedText("Subject (14)"),
		pageKind: "nightmare",
	}), true);

	assert.equal(resolveDisplayInList({
		category: "ultra-lab",
		slug: "dz-wynaut",
		title: buildLocalizedText("DZ Wynaut"),
		pageKind: "lab",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "ultra-lab",
		slug: "advanced-ultra-lab-raibolt",
		title: buildLocalizedText("Advanced Ultra Lab - Raibolt"),
		pageKind: "lab",
	}), true);

	assert.equal(resolveDisplayInList({
		category: "events",
		slug: "pokepark-pontuacao",
		title: buildLocalizedText("PokÃ©park: PontuaÃ§Ã£o"),
		pageKind: "system",
	}), false);
});

test("resolveDisplayTitle and title overrides remove redundant category prefixes", () => {
	assert.deepEqual(
		resolveDisplayTitle(buildLocalizedText("Advanced Ultra Lab - Raibolt"), buildLocalizedText("Ultra Lab")),
		buildLocalizedText("Laboratório Raibolt"),
	);
	assert.deepEqual(
		resolveDisplayTitle(buildLocalizedText("Nightmare Terror - Gama"), buildLocalizedText("Boss Fight")),
		buildLocalizedText("Gama"),
	);
	assert.deepEqual(
		resolveTitleOverride({ category: "tasks", slug: "tasks" }),
		buildLocalizedText("Kanto Tasks"),
	);
});

test("resolveDisplayInList filters event and Nightmare Rift category noise", () => {
	assert.equal(resolveDisplayInList({
		category: "events",
		slug: "pikachu-backpack",
		title: buildLocalizedText("Pikachu Backpack"),
		pageKind: "item",
		navigationPath: ["Eventos", "Mochilas de Eventos"],
	}), false);

	assert.equal(resolveDisplayInList({
		category: "events",
		slug: "christmas-defender-granbull",
		title: buildLocalizedText("Christmas Defender Granbull"),
		pageKind: "item",
		navigationPath: ["Eventos"],
	}), true);

	assert.equal(resolveDisplayInList({
		category: "nightmare-rifts",
		slug: "cozinheiro",
		title: buildLocalizedText("Cozinheiro"),
		pageKind: "profession",
	}), false);

	assert.equal(resolveDisplayInList({
		category: "nightmare-rifts",
		slug: "birth-island",
		title: buildLocalizedText("Birth Island"),
		pageKind: "rift",
		navigationPath: ["Nightmare Rifts", "Arqueologo", "Dungeons"],
	}), false);

	assert.equal(resolveDisplayInList({
		category: "nightmare-rifts",
		slug: "cooks",
		title: buildLocalizedText("Cooks"),
		pageKind: "rift",
		navigationPath: ["Nightmare Rifts", "Cozinheiro"],
	}), false);

	assert.equal(resolveDisplayInList({
		category: "nightmare-rifts",
		slug: "archeologist",
		title: buildLocalizedText("Archeologist"),
		pageKind: "article",
		navigationPath: ["Nightmare Rifts", "Arqueologo"],
	}), false);
});

test("resolvePageGroup publishes item filter groups", () => {
	assert.equal(resolvePageGroup({
		category: "items",
		slug: "ditto-backpack",
		title: buildLocalizedText("Ditto Backpack"),
	})[PT_BR], "Mochilas");

	assert.equal(resolvePageGroup({
		category: "items",
		slug: "compressed-nightmare-gem",
		title: buildLocalizedText("Compressed Nightmare Gem"),
	})[PT_BR], "Moedas e tokens");

	assert.equal(resolvePageGroup({
		category: "items",
		slug: "attack-elixir",
		title: buildLocalizedText("Attack Elixir"),
	})[PT_BR], "Elixirs");

	assert.equal(resolvePageGroup({
		category: "items",
		slug: "dusk-ball",
		title: buildLocalizedText("Dusk Ball"),
		navigationPath: ["Itens", "Bags"],
	})[PT_BR], "Cápsulas e balls");

	assert.equal(resolvePageGroup({
		category: "items",
		slug: "alquimista",
		title: buildLocalizedText("Crafts de Alquimista"),
	})[PT_BR], "Itens de profissão");

	assert.equal(resolvePageGroup({
		category: "items",
		slug: "feather-stone",
		title: buildLocalizedText("Feather Stone"),
		navigationPath: ["Itens", "Itens Gerais", "Pedras de Evolução", "Profissões"],
	})[PT_BR], "Pedras");
});

test("resolvePageGroup publishes Nightmare Rift list sections", () => {
	assert.deepEqual(resolvePageGroup({
		category: "nightmare-rifts",
		slug: "weekly-rifts",
		title: buildLocalizedText("Weekly Rifts"),
	}), {
		[PT_BR]: "Rifts Semanais",
		en: "Weekly Rifts",
		es: "Rifts Semanales",
	});
});

test("resolveSortRank publishes category-specific card order", () => {
	assert.equal(resolveSortRank({
		category: "embedded-tower",
		slug: "camara-do-jirachi",
		title: buildLocalizedText("CÃ¢mara do Jirachi"),
	}), 40);

	assert.equal(resolveSortRank({
		category: "dimensional-zone",
		slug: "golden-dungeons",
		title: buildLocalizedText("Golden Dungeons"),
	}), 30);
});

test("normalizeSections preserves repeated capture-ball media in possible captures", () => {
	const [section] = normalizeSections([{
		id: "possiveis-capturas",
		heading: { [PT_BR]: "PossÃ­veis Capturas" },
		paragraphs: { [PT_BR]: [], en: [], es: [] },
		items: { [PT_BR]: [], en: [], es: [] },
		media: {
			[PT_BR]: [
				{ type: "image", url: "https://wiki.pokexgames.com/images/a/a1/Ultra-ball.png", alt: "Ultra-ball.png" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/a/a1/Ultra-ball.png", alt: "Ultra-ball.png" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/b/b1/Sora-ball.png", alt: "Sora-ball.png" },
			],
			en: [],
			es: [],
		},
	}]);

	assert.equal(section.media[PT_BR].length, 3);
});

test("normalizeSections cleans Dimensional Zone capture table dumps from possible captures", () => {
	const [section] = normalizeSections([{
		id: "possiveis-capturas",
		heading: { [PT_BR]: "Possíveis Capturas" },
		paragraphs: {
			[PT_BR]: ["Pokémon Pokébolas Indicadas 599-Klink.png Klink Ultra-ball(1).png S.klinklang.png Shiny Klinklang Tinker-ball.png"],
			en: [],
			es: [],
		},
		items: { [PT_BR]: ["S.klinklang"], en: [], es: [] },
		media: {
			[PT_BR]: [
				{ type: "image", url: "https://wiki.pokexgames.com/images/a/a1/599-Klink.png", alt: "599-Klink.png" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/a/a1/Ultra-ball.png", alt: "Ultra-ball.png" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/b/b1/S.klinklang.png", alt: "S.klinklang.png" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/c/c1/Tinker-ball.png", alt: "Tinker-ball.png" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/d/d1/470-Sh_Leafeon.png", alt: "470-Sh Leafeon.png" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/e/e1/Janguru-ball.png", alt: "Janguru-ball.png" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/f/f1/596-G_Galvantula.png", alt: "596-G Galvantula.png" },
			],
			en: [],
			es: [],
		},
	}], {
		category: "dimensional-zone",
		slug: "dz-shiny-klinklang",
		pageKind: "zone",
	});

	assert.equal(section.content[PT_BR].paragraphs, undefined);
	assert.deepEqual(section.content[PT_BR].bullets, ["Klink", "Shiny Klinklang", "Shiny Leafeon", "Giant Galvantula"]);
	assert.equal(section.media[PT_BR].length, 7);
});

test("normalizeSections does not rewrite full Shiny capture names", () => {
	const [section] = normalizeSections([{
		id: "possiveis-capturas",
		heading: { [PT_BR]: "Possíveis Capturas" },
		paragraphs: {
			[PT_BR]: ["Pokémon Pokébolas Indicadas 129-GiantMagikarp.png Shiny Giant Magikarp Net-ball.png"],
			en: [],
			es: [],
		},
		items: { [PT_BR]: [], en: [], es: [] },
		media: {
			[PT_BR]: [
				{ type: "image", url: "https://wiki.pokexgames.com/images/2/23/129-GiantMagikarp.png", alt: "129-GiantMagikarp.png", slug: "shiny-giant-magikarp" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/a/a1/Net-ball.png", alt: "Net-ball.png" },
			],
			en: [],
			es: [],
		},
	}], {
		category: "dimensional-zone",
		slug: "dz-shiny-giant-magikarp",
		pageKind: "zone",
	});

	assert.deepEqual(section.content[PT_BR].bullets, ["Shiny Giant Magikarp"]);
	assert.doesNotMatch(section.content[PT_BR].bullets.join(" "), /Shiny Iny/);
});

test("normalizeSections canonicalizes Dimensional Zone possible catches sections", () => {
	const [section] = normalizeSections([{
		id: "possiveis-catches",
		heading: { [PT_BR]: "Possíveis Catches" },
		paragraphs: {
			[PT_BR]: ["431-Glameow.png Glameow 432-Purugly.png Purugly 563.png Cofagrigus"],
			en: [],
			es: [],
		},
		items: { [PT_BR]: [], en: [], es: [] },
		media: {
			[PT_BR]: [
				{ type: "image", url: "https://wiki.pokexgames.com/images/d/d8/431-Glameow.png", alt: "431-Glameow.png", slug: "glameow" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/3/32/432-Purugly.png", alt: "432-Purugly.png", slug: "purugly" },
				{ type: "image", url: "https://wiki.pokexgames.com/images/e/ea/563.png", alt: "563.png", slug: "cofagrigus" },
			],
			en: [],
			es: [],
		},
	}], {
		category: "dimensional-zone",
		slug: "dz-halloween-2020",
		pageKind: "zone",
	});

	assert.equal(section.id, "possiveis-capturas");
	assert.equal(section.title[PT_BR], "Possíveis Capturas");
	assert.equal(section.content[PT_BR].paragraphs, undefined);
	assert.deepEqual(section.content[PT_BR].bullets, ["Glameow", "Purugly", "Cofagrigus"]);
});

test("normalizeSections removes MediaWiki navigation menu sections", () => {
	const sections = normalizeSections([{
		id: "menu-de-navegacao",
		heading: { [PT_BR]: "Menu de navegação" },
		paragraphs: { [PT_BR]: ["# Ferramentas pessoais"], en: [], es: [] },
		items: { [PT_BR]: ["Entrar", "Página Inicial"], en: [], es: [] },
		media: { [PT_BR]: [], en: [], es: [] },
	}, {
		id: "inimigos",
		heading: { [PT_BR]: "Inimigos" },
		paragraphs: { [PT_BR]: ["Quantidade: 72."], en: [], es: [] },
		items: { [PT_BR]: ["129-Magikarp"], en: [], es: [] },
		media: { [PT_BR]: [], en: [], es: [] },
	}]);

	assert.deepEqual(sections.map((section) => section.id), ["inimigos"]);
});

test("buildPagePath publishes DZ pages at canonical dimensional-zone root", () => {
	assert.equal(buildPagePath({
		category: "dimensional-zone",
		slug: "dz-galvantula",
		title: buildLocalizedText("DZ Galvantula"),
		navigationPath: ["Dimensional Zone", "Missões", "Joey Quest", "Informações", "DZ Galvantula"],
		pageKind: "zone",
	}), "dimensional-zone/dz-galvantula.json");
});

test("resolveDisplayInList hides boss-fight discovery roots but keeps discovered bosses", () => {
	assert.equal(resolveDisplayInList({
		category: "boss-fight",
		slug: "nightmare-terror",
		title: buildLocalizedText("Nightmare Terror"),
		pageKind: "index",
		navigationPath: ["Boss Fight", "Nightmare Terror"],
	}), false);

	assert.equal(resolveDisplayInList({
		category: "boss-fight",
		slug: "lavender-s-curse",
		title: buildLocalizedText("Lavender's Curse"),
		pageKind: "boss",
		navigationPath: ["Boss Fight", "Eventos"],
	}), true);

	assert.equal(resolveDisplayInList({
		category: "dimensional-zone",
		slug: "dz-shiny-giant-magikarp",
		title: buildLocalizedText("DZ Shiny Giant Magikarp"),
		pageKind: "lab",
		navigationPath: ["Ultra Lab", "Sarkies Quest", "O Traidor", "DZ Shiny Giant Magikarp"],
	}), true);
});

test("normalizeSections splits embedded tower trap rows into an Armadilhas section", () => {
	const sections = normalizeSections([{
		id: "mapa-do-andar",
		heading: { [PT_BR]: "Mapa do andar" },
		paragraphs: { [PT_BR]: ["Mapa principal."], en: [], es: [] },
		items: { [PT_BR]: ["Observa??o geral.", "Redemoinhos Trap1.gif | 20% da vida m?xima"], en: [], es: [] },
		media: { [PT_BR]: [
			{ type: "image", url: "https://wiki.pokexgames.com/images/a/a1/Mapa.png", alt: "Mapa.png" },
			{ type: "image", url: "https://wiki.pokexgames.com/images/b/b1/Trap1.gif", alt: "Trap1.gif" },
		], en: [], es: [] },
	}]);

	assert.deepEqual(sections.map((section) => section.id), ["mapa-do-andar", "armadilhas"]);
	assert.deepEqual(sections[0].content[PT_BR].bullets, ["Observa??o geral."]);
	assert.deepEqual(sections[1].hazards[PT_BR], {
		description: [],
		bullets: ["Redemoinhos Trap1.gif | 20% da vida m?xima"],
	});
	assert.equal(sections[1].media[PT_BR][0].alt, "Trap1.gif");
});

test("normalizeSections publishes embedded tower access as ordered steps with media", () => {
	const sections = normalizeSections(extractSections(`
		<h2>Como conseguir acesso à Embedded Tower</h2>
		<p>Primeiramente o jogador deve ir até Phenac e falar com o Professor Sycamore.</p>
		<table border="1" style="text-align: center; border-collapse: collapse">
			<tr><td width="100%"><a href="/index.php/Embedded_Tower" title="Embedded Tower"><img alt="Syncamore12.jpg" src="/images/4/44/Syncamore12.jpg" width="475" height="493" /></a></td></tr>
		</table>
		<ul><li>Após isso, o Professor irá pedir para que fale com Barry.</li></ul>
		<table border="1" style="text-align: center; border-collapse: collapse">
			<tr><td width="100%"><img alt="Barry.png" src="/images/9/90/Barry.png" width="475" height="493" /></td></tr>
		</table>
		<ul><li>Barry dirá que perdeu sua mochila e irá pedir que procure, ela se encontra em um destes locais:</li></ul>
		<table class="wikitable">
			<tr><td><img alt="Possivel 1.png" src="/images/f/fe/Possivel_1.png" width="360" height="440" /></td><td><img alt="Possivel 2.png" src="/images/3/3e/Possivel_2.png" width="361" height="430" /></td></tr>
		</table>
		<ul><li>Depois disto, retorne ao Barry para entregar a sua mochila e ele lhe entregará o Sky Pillar emblem:</li></ul>
		<table border="1" style="text-align: center; border-collapse: collapse">
			<tr><td width="100%"><img alt="Sky Pillar emblem1.png" src="/images/5/50/Sky_Pillar_emblem1.png" width="385" height="334" /></td></tr>
		</table>
		<ul><li>Conversando com o NPC Professor Sycamore, ele irá continuar a história da Embedded Tower.</li></ul>
	`, "Como Funciona", "https://wiki.pokexgames.com/index.php/Funcionamento_da_Embedded_Tower"), {
		category: "embedded-tower",
		slug: "funcionamento-da-embedded-tower",
		pageKind: "tower",
	});

	assert.equal(sections[0].id, "como-conseguir-acesso-a-embedded-tower");
	assert.equal(sections[0].content, undefined);
	assert.equal(sections[0].tables, undefined);
	assert.deepEqual(sections[0].steps[PT_BR].map((step) => step.title), [
		"Professor Sycamore",
		"Barry",
		"Mochila perdida",
		"Sky Pillar emblem",
		"Liberação da Tower",
	]);
	assert.deepEqual(sections[0].steps[PT_BR].map((step) => step.body), [
		["Primeiramente o jogador deve ir até Phenac e falar com o Professor Sycamore", "Syncamore12.jpg"],
		["Após isso, o Professor irá pedir para que fale com Barry", "Barry.png"],
		["Barry dirá que perdeu sua mochila e irá pedir que procure, ela se encontra em um destes locais", "Possivel 1.png", "Possivel 2.png"],
		["Depois disto, retorne ao Barry para entregar a sua mochila e ele lhe entregará o Sky Pillar emblem", "Sky Pillar emblem1.png"],
		["Conversando com o NPC Professor Sycamore, ele irá continuar a história da Embedded Tower"],
	]);
	assert.equal(sections[0].media[PT_BR][0].slug, "embedded-tower");
	assert.equal(JSON.stringify(sections[0]).includes("Possivel | Possivel"), false);
});

test("normalizeSections keeps mystery dungeon abilities typed and preserves ability videos", () => {
	const sections = normalizeSections(extractSections(`
		<h2>Habilidades</h2>
		<div class="tabber">
			<article class="tabber__panel" data-title="Bullet Seed">
				<p>Dispara sementes em linha reta.</p>
				<video src="https://wiki.pokexgames.com/images/b/b1/BulletSeedDorabelle.mp4" width="425" height="355"></video>
			</article>
			<article class="tabber__panel" data-title="Giga Drain">
				<p>Rouba vida dos inimigos.</p>
				<video src="https://wiki.pokexgames.com/images/4/43/DorabelleGigaDrain.mp4" width="425" height="355"></video>
			</article>
		</div>
	`, "Mystery Dungeon - Dorabelle's Wrath", "https://wiki.pokexgames.com/index.php/Mystery_Dungeon_-_Dorabelle%27s_Wrath"), {
		category: "mystery-dungeons",
		slug: "mystery-dungeon-dorabelle-s-wrath",
		pageKind: "article",
	});

	assert.equal(sections[0].id, "habilidades");
	assert.equal(sections[0].content, undefined);
	assert.deepEqual(sections[0].abilities[PT_BR], [
		{ name: "Bullet Seed", description: ["Dispara sementes em linha reta"] },
		{ name: "Giga Drain", description: ["Rouba vida dos inimigos"] },
	]);
	assert.equal(sections[0].media[PT_BR].length, 2);
	assert.equal(sections[0].media[PT_BR][0].type, "video");
});

test("extractSections promotes reward h3 headings out of important information", () => {
	const sections = normalizeSections(extractSections(`
		<h2>Informacoes Importantes</h2>
		<p>Derrote os inimigos antes que o tempo acabe.</p>
		<h3>Recompensas</h3>
		<div class="tabber">
			<article class="tabber__panel" data-title="Primeira vez">
				<p>Granbull Backpack.png Christmas Defender Granbull</p>
			</article>
		</div>
	`, "Christmas Defender Granbull", "https://wiki.pokexgames.com/index.php/Christmas_Defender_Granbull"), {
		category: "events",
		slug: "christmas-defender-granbull",
		pageKind: "item",
	});

	assert.deepEqual(sections.map((section) => section.id), ["informacoes-importantes", "recompensas"]);
	assert.deepEqual(sections[0].dungeonSupport[PT_BR].intro, ["Derrote os inimigos antes que o tempo acabe"]);
	assert.equal(sections[1].kind, "rewards");
	assert.ok(sections[1].rewards[PT_BR].length >= 1);
});

test("normalizeSections extracts PokÃ©Park score tool rows from the embedded wiki script", () => {
	const sections = normalizeSections(extractSections(`
		<h2>Pontuacao</h2>
		<div id="pokepark-tool"></div>
		<script>
			const pokemonByPoints = {
				1: [
					{ name: "Bulbasaur", image: "001-Bulbasaur.png" },
					{ name: "Charmander", image: "004-Charmander.png" },
				],
				20: [
					{ name: "Mew", image: "151-Mew.png", special: true },
				],
			};
		</script>
	`, "PokÃ©Park", "https://wiki.pokexgames.com/index.php/Pok%C3%A9Park"), {
		category: "events",
		slug: "pokepark",
		pageKind: "system",
	});

	const pontuacao = sections.find((section) => section.id === "pontuacao");
	assert.equal(pontuacao.commerceEntries[PT_BR].type, "pokepark-score");
	assert.deepEqual(pontuacao.commerceEntries[PT_BR].rows[0], {
		cells: [
			{ text: "Bulbasaur", raw: "001-Bulbasaur.png" },
			{ text: "1 pts" },
		],
	});
	assert.deepEqual(pontuacao.commerceEntries[PT_BR].rows[2], {
		cells: [
			{ text: "Mew", raw: "151-Mew.png" },
			{ text: "20 pts" },
			{ text: "Especial" },
		],
	});
});

test("normalizeSections keeps daily mission location galleries as media-rich table sections", () => {
	const sections = normalizeSections(extractSections(`
		<h2>Localização da NPC Officer Jenny</h2>
		<table class="wikitable bg-none border-0" width="70%" style="text-align:center;">
			<tr>
				<td><img alt="Cerulean NW Jenny.png" src="/images/3/3e/Cerulean_NW_Jenny.png" width="352" height="300" /></td>
				<td><img alt="Pewter NW Jenny.png" src="/images/4/47/Pewter_NW_Jenny.png" width="350" height="300" /></td>
			</tr>
			<tr>
				<td>Cerulean</td>
				<td>Pewter</td>
			</tr>
		</table>
	`, "Nightmare Officer Jenny", "https://wiki.pokexgames.com/index.php/Nightmare_Officer_Jenny"), {
		category: "daily-missions",
		slug: "nightmare-officer-jenny",
		pageKind: "daily-mission",
	});

	assert.equal(sections[0].id, "localizacao-da-npc-officer-jenny");
	assert.equal(sections[0].content, undefined);
	assert.deepEqual(sections[0].tables[PT_BR][0].rows[0], {
		cells: [
			{ text: "Cerulean NW Jenny" },
			{ text: "Pewter NW Jenny" },
		],
	});
	assert.equal(sections[0].media[PT_BR].length, 2);
	assert.equal(sections[0].media[PT_BR][0].alt, "Cerulean NW Jenny.png");
});
