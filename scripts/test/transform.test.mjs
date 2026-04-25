import test from "node:test";
import assert from "node:assert/strict";

import { publishSection, structureSection, parsePokemonItemText, parseRewardItemText } from "../lib/transform.mjs";
import { PT_BR } from "../lib/shared.mjs";

function localizedSection(section) {
	return {
		...section,
		heading: { [PT_BR]: section.heading, en: section.heading, es: section.heading },
		paragraphs: { [PT_BR]: section.paragraphs ?? [], en: section.paragraphs ?? [], es: section.paragraphs ?? [] },
		items: { [PT_BR]: section.items ?? [], en: section.items ?? [], es: section.items ?? [] },
		media: { [PT_BR]: section.media ?? [], en: section.media ?? [], es: section.media ?? [] },
	};
}

test("structureSection extracts pokemon profile, moves, effectiveness and variants", () => {
	const info = structureSection(localizedSection({
		id: "informacoes-gerais",
		heading: "Informações Gerais",
		paragraphs: ["Nome: Absol Level: 120 Elemento: Dark Habilidades: Pressure, Super Luck Boost: Calculator Materia: Gardestrike ou Raibolt"],
	}));

	assert.equal(info.profile[PT_BR].name, "Absol");
	assert.deepEqual(info.profile[PT_BR].elements, ["Dark"]);
	assert.deepEqual(info.profile[PT_BR].abilities, ["Pressure", "Super Luck"]);
	assert.deepEqual(info.profile[PT_BR].materiaTargets.map((item) => item.slug), ["gardestrike", "raibolt"]);

	const moves = structureSection(localizedSection({
		id: "movimentos",
		heading: "Movimentos",
		paragraphs: ["# Level Up"],
		items: ["Slash (10s) | Physical | Dark", "Level 45", "Night Slash (12s) | Physical | Dark", "Level 60"],
	}));

	assert.equal(moves.moves[PT_BR][0].rows[0].name, "Slash");
	assert.equal(moves.moves[PT_BR][0].rows[1].level, "Level 60");

	const effectiveness = structureSection(localizedSection({
		id: "efetividade",
		heading: "Efetividade",
		paragraphs: ["Forte contra: Ghost, Psychic. Fraco contra: Fighting, Fairy."],
	}));

	assert.deepEqual(effectiveness.effectiveness[PT_BR][0], { label: "Forte contra", values: ["Ghost", "Psychic"] });

	const variants = structureSection(localizedSection({
		id: "outras-versoes",
		heading: "Outras Versões",
		items: ["absol.gif | Absol", "mega-absol.gif | Mega Absol (TM)"],
	}));

	assert.equal(variants.variants[PT_BR][1].slug, "mega-absol");
	assert.equal(variants.variants[PT_BR][1].badge, "TM");
});

test("parseRewardItemText keeps ranking places and loot difficulties structured", () => {
	assert.deepEqual(
		parseRewardItemText("1º lugar | ultra-box.png Ultra Box 2 rare-candy.png Rare Candy"),
		{
			type: "ranking",
			place: "1º lugar",
			prizes: [
				{ qty: "", name: "Ultra Box" },
				{ qty: "2", name: "Rare Candy" },
			],
		},
	);

	assert.deepEqual(
		parseRewardItemText("loot.png | Treasure Box (Fácil) | Raro"),
		{
			type: "loot",
			name: "Treasure Box",
			difficulty: "Fácil",
			rarity: "Raro",
			qty: null,
		},
	);

	assert.deepEqual(
		parseRewardItemText("Emeralds Emerald (1 -??)"),
		{
			type: "loot",
			name: "Emerald",
			difficulty: null,
			rarity: null,
			qty: "1 -??",
		},
	);

	assert.deepEqual(
		parseRewardItemText("Yellowpresent Yellow Present (Semi Raro)"),
		{
			type: "loot",
			name: "Yellow Present",
			difficulty: null,
			rarity: "Semi Raro",
			qty: null,
		},
	);

	assert.deepEqual(
		parseRewardItemText("UnpackedToy.png Unpacked Toy (Ultra Raro)"),
		{
			type: "loot",
			name: "Unpacked Toy",
			difficulty: null,
			rarity: "Ultra Raro",
			qty: null,
		},
	);
});

test("parsePokemonItemText preserves multiple roles in the same PvE or PvP field", () => {
	assert.deepEqual(
		parsePokemonItemText("Shiny Pupitar (PvE: OTDD PvE / BDD PvE / PvP: Tank PvP)"),
		{
			name: "Shiny Pupitar",
			exclusive: false,
			pve: "OTDD PvE / BDD PvE",
			pvp: "Tank PvP",
		},
	);
});

test("structureSection removes bogus Link role text from pokemon table rows", () => {
	const tier = structureSection(localizedSection({
		id: "tier-1",
		heading: "Tier 1",
		items: ["Azumarill (PvE: Link / PvP: Tank PvP)"],
	}));

	assert.deepEqual(tier.pokemon[PT_BR][0], {
		name: "Azumarill",
		exclusive: false,
		pve: "Not",
		pvp: "Tank PvP",
	});
});

test("structureSection removes raw pokemon sprite reference rows from prose sections", () => {
	const section = structureSection(localizedSection({
		id: "missoes-secretas",
		heading: "Missões secretas",
		items: [
			"074-Geodude Geodude | 081-Magnemite Magnemite",
			"669.Flabébé.png Flabébé",
			"Fale com o NPC Arthur.",
		],
	}));

	assert.deepEqual(section.items[PT_BR], ["Fale com o NPC Arthur."]);
});

test("structureSection publishes structured task cards upstream", () => {
	const dailyTier = structureSection(localizedSection({
		id: "nivel-25-ao-59",
		heading: "Nível 25 ao 59",
		paragraphs: ["25k de experiência e 1 Newbie Gifts Itens Possíveis da Newbie Gift: Superbag."],
		items: ["029-Nidoranfe Nidoranfe | 056-Mankey Mankey"],
	}));

	assert.equal(dailyTier.kind, "tasks");
	assert.equal(dailyTier.tasks[PT_BR][0].objective, "Nível 25 ao 59");
	assert.deepEqual(dailyTier.tasks[PT_BR][0].rewards.slice(0, 2), [
		{ type: "loot", name: "Experiência", icon: "xp", rarity: null, difficulty: null, qty: "25k" },
		{ type: "loot", name: "Newbie Gifts", rarity: null, difficulty: null, qty: "1" },
	]);
	assert.deepEqual(dailyTier.tasks[PT_BR][0].targets, ["Nidoranfe", "Mankey"]);

	const nightmare = structureSection(localizedSection({
		id: "nightmare-tasks",
		heading: "Visão geral",
		paragraphs: [],
		items: ["1. NPC Missy | Derrotar: 300 678-Meowstic Meowstic | Level: 400 NW Level: 50 | Exp icon 2.000.000 Exp icon nw 40.000 Black Nightmare Gem 2 Black Nightmare Gem"],
	}));

	assert.equal(nightmare.kind, "tasks");
	assert.equal(nightmare.tasks[PT_BR][0].title, "NPC Missy");
	assert.equal(nightmare.tasks[PT_BR][0].objective, "Derrotar: 300 Meowstic");
	assert.equal(nightmare.tasks[PT_BR][0].npc, "Missy");
	assert.equal(nightmare.tasks[PT_BR][0].requirementsText, undefined);
	assert.deepEqual(nightmare.tasks[PT_BR][0].requirements, { level: 400, nightmareLevel: 50 });
	assert.deepEqual(nightmare.tasks[PT_BR][0].objectiveDetails.targets, [{ name: "Meowstic", slug: "meowstic", amount: 300 }]);
	assert.deepEqual(nightmare.tasks[PT_BR][0].rewards.map((reward) => [reward.name, reward.qty]), [
		["Experiência", "2.000.000"],
		["Nightmare Experience", "40.000"],
		["Black Nightmare Gem", "2"],
	]);
});

test("publishSection emits v2 structured sections without legacy raw mirrors", () => {
	const source = structureSection(localizedSection({
		id: "nightmare-tasks",
		heading: "Nightmare Tasks",
		paragraphs: ["As Nightmare Balls e Beast Balls NAO sao itens unicos."],
		items: [
			"1 Nightmare Cerulean",
			"1. NPC Missy | Derrotar: 300 678-Meowstic Meowstic | Level: 400 NW Level: 50 | Exp icon 2.000.000 Exp icon nw 40.000 Black Nightmare Gem 2 Black Nightmare Gem",
		],
	}));
	const section = publishSection(source);

	assert.equal(section.title[PT_BR], "Nightmare Tasks");
	assert.equal(section.kind, "tasks");
	assert.equal(section.items, undefined);
	assert.equal(section.paragraphs, undefined);
	assert.equal(section.heading, undefined);
	assert.equal(section.content[PT_BR].paragraphs[0], "As Nightmare Balls e Beast Balls NAO sao itens unicos.");
	assert.equal(section.content[PT_BR].list, undefined);
	assert.equal(section.taskGroups[PT_BR].groups[0].name, "Nightmare Cerulean");
	assert.equal(section.taskGroups[PT_BR].groups[0].tasks[0].npc, "Missy");
	assert.deepEqual(Object.keys(section.title), [PT_BR]);
});

test("publishSection compacts identical locale payloads and emits clan task ranks", () => {
	const section = publishSection(structureSection(localizedSection({
		id: "tasks",
		pageCategory: "clans",
		pageSlug: "gardestrike-tasks",
		heading: "Tasks",
		paragraphs: [
			"# Rank 1 ao 2",
			"Para iniciar a primeira tarefa, o jogador deve conversar com o NPC Fist Trainer. Etapa 1 - Coletar Quantidade Item 1.500 Rubber Ball 1.500 Band-aid 5 Iron Bracelet Etapa 2 - Capturar Primeape Etapa 3 - Derrotar (1ª Lista) 50 Onix 50 Tauros 25 Sneasel 25 Stantler Danger Room Team Tauros Farfetch'd Stantler Primeape Loudred Fearow Após concluir duas salas da Danger Room, o jogador receberá 100.000 de experiência e uma Punch Stone.",
		],
	})));

	assert.deepEqual(Object.keys(section.clanTasks), [PT_BR]);
	assert.equal(section.clanTasks[PT_BR].ranks[0].title, "Rank 1 ao 2");
	assert.equal(section.clanTasks[PT_BR].ranks[0].stages[0].label, "Coletar");
	assert.equal(section.clanTasks[PT_BR].ranks[0].stages[0].rows[0].item, "Rubber Ball");
	assert.equal(section.clanTasks[PT_BR].ranks[0].stages[2].targets[0].name, "Onix");
	assert.match(section.clanTasks[PT_BR].ranks[0].dangerRoomTeamText, /Tauros/);
});

test("publishSection emits structured tables and bullets instead of raw pipe lists", () => {
	const source = structureSection(localizedSection({
		id: "outros",
		heading: "Outros",
		paragraphs: ["Fale com o NPC."],
		items: [
			"Entrada Gyakkyo | Entrada Gyakkyo",
			"Observa\u00e7\u00e3o solta.",
		],
	}));
	const section = publishSection(source);

	assert.deepEqual(section.content[PT_BR], {
		paragraphs: ["Fale com o NPC."],
		bullets: ["Observa\u00e7\u00e3o solta."],
	});
	assert.deepEqual(section.tables[PT_BR][0].rows[0], {
		cells: [
			{ text: "Entrada Gyakkyo" },
			{ text: "Entrada Gyakkyo" },
		],
	});
	assert.equal(section.content[PT_BR].list, undefined);
});

test("publishSection emits typed abilities, steps and locations", () => {
	const abilities = publishSection(structureSection(localizedSection({
		id: "habilidades",
		heading: "Habilidades",
		paragraphs: ["# Fire Breath", "Causa dano em area.", "# Stomp", "Empurra inimigos."],
	})));

	assert.deepEqual(abilities.abilities[PT_BR], [
		{ name: "Fire Breath", description: ["Causa dano em area"] },
		{ name: "Stomp", description: ["Empurra inimigos"] },
	]);
	assert.equal(abilities.content, undefined);

	const steps = publishSection(structureSection(localizedSection({
		id: "funcionamento",
		heading: "Funcionamento",
		paragraphs: ["# Entrada", "Fale com Wes.", "# Batalha", "Derrote os pokemons."],
	})));

	assert.deepEqual(steps.steps[PT_BR], [
		{ index: 1, title: "Entrada", body: ["Fale com Wes"] },
		{ index: 2, title: "Batalha", body: ["Derrote os pokemons"] },
	]);
	assert.equal(steps.content, undefined);

	const location = publishSection(structureSection(localizedSection({
		id: "localizacao",
		heading: "Localiza\u00e7\u00e3o",
		paragraphs: ["Entrada principal."],
		items: ["Cidade | Coordenada", "Use surf."],
	})));

	assert.deepEqual(location.locations[PT_BR], [{
		description: ["Entrada principal"],
		bullets: ["Use surf"],
		rows: [{
			cells: [
				{ text: "Cidade" },
				{ text: "Coordenada" },
			],
		}],
	}]);
	assert.equal(location.content, undefined);
});

test("publishSection keeps prose-only special ability sections generic", () => {
	const section = publishSection(structureSection(localizedSection({
		id: "habilidades-especiais",
		heading: "Habilidades Especiais",
		paragraphs: [
			"ATENÇÃO: algumas habilidades especiais são exclusivas para jogadores VIP.",
			"Veja quais habilidades um jogador VIP pode utilizar.",
		],
		items: ["Surfarvip.gif | Flyyy.gif | SURF2VIP.gif"],
	})));

	assert.equal(section.abilities, undefined);
	assert.deepEqual(section.content[PT_BR].paragraphs, [
		"ATENÇÃO: algumas habilidades especiais são exclusivas para jogadores VIP.",
		"Veja quais habilidades um jogador VIP pode utilizar.",
	]);
	assert.ok(section.tables[PT_BR][0].rows[0].cells.length >= 2);
});

test("structureSection emits boss difficulties, held enhancement, hazards, and quest phases", () => {
	const bossDifficulties = publishSection(structureSection(localizedSection({
		id: "dificuldades",
		pageCategory: "boss-fight",
		heading: "Dificuldades",
		paragraphs: [
			"Os jogadores podem realizar em três dificuldades.",
			"Fácil: requer no mínimo nível 200 e possui um level cap no nível 350. Os jogadores deverão deixar a vida do Boss em 65% para concluir. Para entrar nesta dificuldade, é necessário que o jogador tenha 1 Entei Charm.",
			"Normal: requer no mínimo nível 300 e possui um level cap no nível 450.",
			"Observação: As dificuldades Normal e Difícil possuem Held Enhancement.",
		],
	})));

	assert.equal(bossDifficulties.difficulties[PT_BR].entries[0].name, "Fácil");
	assert.equal(bossDifficulties.difficulties[PT_BR].entries[0].minimumLevel, 200);
	assert.equal(bossDifficulties.difficulties[PT_BR].entries[0].levelCap, 350);
	assert.equal(bossDifficulties.difficulties[PT_BR].entries[0].entryRequirement.amount, 1);

	const bossSupport = publishSection(structureSection(localizedSection({
		id: "informacoes-importantes",
		pageCategory: "boss-fight",
		heading: "Informações importantes",
		paragraphs: ["Berries recomendadas para o Gama: Rindo Berry."],
		items: [
			"A batalha é feita em grupo de 4 jogadores.",
			"Entrada | Nightmare Token",
		],
	})));

	assert.equal(bossSupport.content, undefined);
	assert.equal(bossSupport.tables, undefined);
	assert.deepEqual(bossSupport.bossSupport[PT_BR], {
		type: "important-info",
		intro: ["Berries recomendadas para o Gama: Rindo Berry"],
		bullets: ["A batalha é feita em grupo de 4 jogadores"],
		rows: [{
			cells: [
				{ text: "Entrada" },
				{ text: "Nightmare Token" },
			],
		}],
	});

	const bossRecommendations = publishSection(structureSection(localizedSection({
		id: "pokemon-recomendados",
		pageCategory: "boss-fight",
		heading: "PokÃ©mon recomendados",
		paragraphs: [
			"Use PokÃ©mon resistentes ao elemento do boss.",
			"# Tanques",
			"Preferir opÃ§Ãµes com cura ou bloqueio.",
			"# Dano",
		],
		items: [
			"Blastoise | Big Onix",
			"Shiny Golduck | Alolan Golem",
		],
	})));

	assert.equal(bossRecommendations.content, undefined);
	assert.equal(bossRecommendations.tables, undefined);
	assert.deepEqual(bossRecommendations.bossRecommendations[PT_BR], {
		intro: ["Use PokÃ©mon resistentes ao elemento do boss"],
		groups: [{
			label: "Tanques",
			notes: ["Preferir opÃ§Ãµes com cura ou bloqueio"],
			pokemon: ["Blastoise", "Big Onix"],
		}, {
			label: "Dano",
			notes: [],
			pokemon: ["Shiny Golduck", "Alolan Golem"],
		}],
	});

	const heldEnhancement = publishSection(structureSection(localizedSection({
		id: "held-enhancement",
		heading: "Held Enhancement",
		paragraphs: [
			"Esse sistema concede bônus.",
			"Normal: caso o jogador esteja utilizando Held de Tier 6, causará 35% mais dano e receberá 35% menos dano dos inimigos. Esses valores são aumentados para 37% caso o jogador esteja utilizando Held de Tier 7.",
		],
		items: [
			"Esse sistema somente é válido para o Held equipado diretamente no slot X do Pokémon.",
		],
	})));

	assert.equal(heldEnhancement.heldEnhancement[PT_BR].entries[0].difficulty, "Normal");
	assert.deepEqual(heldEnhancement.heldEnhancement[PT_BR].entries[0].tiers[0], {
		tier: 6,
		damageBonus: 35,
		defenseBonus: 35,
	});
	assert.equal(heldEnhancement.heldEnhancement[PT_BR].notes.length, 1);

	const hazards = publishSection(structureSection(localizedSection({
		id: "armadilhas",
		heading: "Armadilhas",
		paragraphs: ["A armadilha causa dano alto."],
		items: ["Fique longe da área vermelha."],
	})));

	assert.deepEqual(hazards.hazards[PT_BR], {
		description: ["A armadilha causa dano alto"],
		bullets: ["Fique longe da área vermelha"],
	});

	const questPhase = publishSection(structureSection(localizedSection({
		id: "1-parte",
		pageCategory: "quests",
		heading: "1ª Parte",
		paragraphs: ["Fale com o NPC Goh.", "Após 2 horas, entregue a carta e receberá 500.000 de experiência."],
		items: ["Item | Quantidade", "Observação: use Fly."],
		media: [{ type: "image", url: "https://wiki.pokexgames.com/images/5/50/Localizacao_Goh.png", alt: "Localizacao Goh.png", slug: "localizacao-goh" }],
	})));

	assert.equal(questPhase.content, undefined);
	assert.deepEqual(questPhase.questPhases[PT_BR].body, [
		"Fale com o NPC Goh",
		"Após 2 horas, entregue a carta e receberá 500.000 de experiência",
	]);
	assert.deepEqual(questPhase.questPhases[PT_BR].npcs, ["Goh"]);
	assert.deepEqual(questPhase.questPhases[PT_BR].waits, ["2 horas"]);
	assert.deepEqual(questPhase.questPhases[PT_BR].rows[0], {
		cells: [
			{ text: "Item" },
			{ text: "Quantidade" },
		],
	});
	assert.equal(questPhase.questPhases[PT_BR].rewards[0].name, "Experiência");
});

test("structureSection emits held item categories and x-boost groups without raw prose mirrors", () => {
	const heldCategories = publishSection(structureSection(localizedSection({
		id: "categories",
		pageCategory: "held-items",
		heading: "Categories",
		paragraphs: [
			"# Offensive",
			"Icon Name Tier 1 Tier 2 Tier 3 Tier 4 Tier 5 Tier 6 Tier 7 Tier 8 Tier 9 Description X-Attack 8% 12% 16% 19% 22% 25% 28% 31% N/A Increases the Pokémon's strength by X%. X-Critical 8% 10% 12% 14% 16% 20% 24% 27% N/A Grants X% chance to deal critical damage.",
		],
	})));

	assert.equal(heldCategories.content, undefined);
	assert.equal(heldCategories.heldCategories[PT_BR].groups[0].name, "Offensive");
	assert.equal(heldCategories.heldCategories[PT_BR].groups[0].entries[0].name, "X-Attack");
	assert.deepEqual(heldCategories.heldCategories[PT_BR].groups[0].entries[0].tiers[0], { tier: 1, value: "8%" });

	const heldBoosts = publishSection(structureSection(localizedSection({
		id: "information-about-x-boost",
		pageCategory: "held-items",
		heading: "Information about X-Boost",
		paragraphs: [
			"# Tier 1",
			"Level Range Boost 0 to 99 6 100 to 149 9 150 to 399 12 400 to 625 15",
			"# Utility X",
			"Icon Name Tier 1 Tier 2 Tier 3 Tier 4 Tier 5 Tier 6 Tier 7 Tier 8 Tier 9 Description X-Lucky 10% 20% 35% 50% 65% 80% 100% N/A 150% Increases the chance of dropping items by X%.",
		],
	})));

	assert.equal(heldBoosts.content, undefined);
	assert.equal(heldBoosts.heldBoosts[PT_BR].ranges[0].name, "Tier 1");
	assert.deepEqual(heldBoosts.heldBoosts[PT_BR].ranges[0].rows[0], { levelRange: "0 to 99", boost: "6" });
	assert.equal(heldBoosts.heldBoosts[PT_BR].utilities[0].entries[0].name, "X-Lucky");

	const heldDetails = publishSection(structureSection(localizedSection({
		id: "detalhes-especificos",
		pageCategory: "held-items",
		heading: "Detalhes Específicos",
		paragraphs: [
			"Algumas regras especiais ainda se aplicam.",
			"X-Haste: Não aumenta a velocidade do Fly ou Ride.",
			"Y-Regeneration: A regeneração de vida é limitada em 100/s.",
		],
	})));

	assert.equal(heldDetails.content, undefined);
	assert.deepEqual(heldDetails.heldDetails[PT_BR], {
		intro: ["Algumas regras especiais ainda se aplicam"],
		entries: [
			{ name: "X-Haste", value: "Não aumenta a velocidade do Fly ou Ride" },
			{ name: "Y-Regeneration", value: "A regeneração de vida é limitada em 100/s" },
		],
	});
});

test("structureSection emits typed held-item operation steps for equip/remove/device/fusion flows", () => {
	const equipPokemon = publishSection(structureSection(localizedSection({
		id: "como-equipar-em-seu-pokemon",
		pageCategory: "held-items",
		heading: "Como Equipar em seu PokÃ©mon",
		paragraphs: [
			"O PokÃ©mon deve estar em sua mochila para equipar um Held Item.",
			"AtenÃ§Ã£o:",
			"Usar um Held Item em um PokÃ©mon que jÃ¡ possui um Held Item do mesmo tipo farÃ¡ com que o Held anterior seja perdido.",
		],
		items: [
			"Ao colocar um Held Item, sÃ³ poderÃ¡ remover mediante pagamento no NPC Apolo.",
			"Ã‰ possÃ­vel adicionar um Held Item inativo X e Y no seu PokÃ©mon.",
		],
	})));

	assert.equal(equipPokemon.content, undefined);
	assert.equal(equipPokemon.steps[PT_BR][0].title, "Equipar no PokÃ©mon");
	assert.deepEqual(equipPokemon.steps[PT_BR][0].body, [
		"O PokÃ©mon deve estar em sua mochila para equipar um Held Item",
	]);
	assert.deepEqual(equipPokemon.steps[PT_BR][0].bullets, [
		"Usar um Held Item em um PokÃ©mon que jÃ¡ possui um Held Item do mesmo tipo farÃ¡ com que o Held anterior seja perdido",
		"Ao colocar um Held Item, sÃ³ poderÃ¡ remover mediante pagamento no NPC Apolo",
		"Ã‰ possÃ­vel adicionar um Held Item inativo X e Y no seu PokÃ©mon",
	]);

	const equipDevice = publishSection(structureSection(localizedSection({
		id: "como-equipar-um-held-item-em-seu-device",
		pageCategory: "held-items",
		heading: "Como equipar um Held Item em seu Device",
		paragraphs: [
			"Da mesma forma que Ã© colocado um Held Item no PokÃ©mon, Ã© colocado no Device.",
			"AtenÃ§Ã£o: Usar um Held Item em um Device que jÃ¡ esteja equipado farÃ¡ com que o antigo seja perdido.",
			"Como colocar o Held Item no Improved Device No Improved Device Ã© necessÃ¡rio escolher o modo do Held.",
		],
		items: [
			"PadrÃ£o | Improved-Device-padrÃ£o.gif",
			"Defensivo | Improved-Device-defensivo.gif",
		],
	})));

	assert.equal(equipDevice.steps[PT_BR][0].title, "Equipar no Device");
	assert.equal(equipDevice.steps[PT_BR][1].title, "Improved Device");
	assert.deepEqual(equipDevice.steps[PT_BR][1].rows[0], {
		cells: [
			{ text: "PadrÃ£o" },
			{ text: "Improved-Device-padrÃ£o", raw: "Improved-Device-padrÃ£o.gif" },
		],
	});

	const removeDevice = publishSection(structureSection(localizedSection({
		id: "como-remover-um-held-item-de-seu-device",
		pageCategory: "held-items",
		heading: "Como remover um Held Item de seu Device",
		paragraphs: [
			"A remoÃ§Ã£o Ã© feita com a NPC Atena no Trade Center.",
			"Caso o jogador possua o Improved Device, a NPC Atena removerÃ¡ apenas o Held Item do modo em uso.",
		],
		items: [
			"Para remover o Held Item padrÃ£o, o Device deve estar no Modo PadrÃ£o.",
			"Para remover o Held Item defensivo, o Device deve estar no Modo Defensivo.",
			"Tier 1 | 10K",
			"Tier 2 | 25K",
		],
	})));

	assert.deepEqual(removeDevice.steps[PT_BR][0].bullets, [
		"Para remover o Held Item padrÃ£o, o Device deve estar no Modo PadrÃ£o",
		"Para remover o Held Item defensivo, o Device deve estar no Modo Defensivo",
	]);
	assert.equal(removeDevice.steps[PT_BR][0].rows[1].cells[1].text, "25K");

	const fusion = publishSection(structureSection(localizedSection({
		id: "fusao-de-held-item",
		pageCategory: "held-items",
		heading: "FusÃ£o de Held Item",
		paragraphs: [
			"Na New Island existe uma mÃ¡quina para realizar a fusÃ£o de Held Itens.",
			"Ã‰ possÃ­vel fundir 3 Held Itens do mesmo Tier para receber um de Tier superior.",
			"Como realizar a fusÃ£o:",
			"ObservaÃ§Ãµes importantes sobre a fusÃ£o:",
		],
		items: [
			"VÃ¡ atÃ© a New Island e encontre a mÃ¡quina.",
			"Coloque 3 Held Itens de um mesmo Tier dentro da mÃ¡quina.",
			"Clique na mÃ¡quina.",
			"Os Held Item X-Block e X-Upgrade nÃ£o podem ser utilizados para fusÃµes.",
			"Tier 1 para Tier 2 | 60.000 dÃ³lares",
			"Tier 2 para Tier 3 | 150.000 dÃ³lares",
		],
	})));

	assert.equal(fusion.content, undefined);
	assert.equal(fusion.steps[PT_BR][0].title, "VisÃ£o Geral");
	assert.equal(fusion.steps[PT_BR][1].title, "Como realizar a fusÃ£o");
	assert.equal(fusion.steps[PT_BR][2].title, "ObservaÃ§Ãµes importantes");
	assert.deepEqual(fusion.steps[PT_BR][2].rows[0], {
		cells: [
			{ text: "Tier 1 para Tier 2" },
			{ text: "60.000 dÃ³lares" },
		],
	});
});

test("structureSection emits typed quest support sections without raw prose mirrors", () => {
	const questSupport = publishSection(structureSection(localizedSection({
		id: "boss-mega-dungeons",
		pageCategory: "quests",
		heading: "Boss & Mega Dungeons",
		paragraphs: [
			"Após o jogador finalizar a Wes Quest, ficará disponível o craft de dois novos itens.",
		],
		items: [
			"Alpha Antidote | Omega Antidote",
			"Clique na imagem abaixo para ir para a página das Dungeons.",
		],
		media: [
			{ type: "image", url: "https://wiki.pokexgames.com/images/c/c0/Alpha_Antidote.png", alt: "Alpha Antidote.png", slug: "alpha-antidote" },
			{ type: "image", url: "https://wiki.pokexgames.com/images/5/5c/Omega_Antidote.png", alt: "Omega Antidote.png", slug: "omega-antidote" },
		],
	})));

	assert.equal(questSupport.content, undefined);
	assert.deepEqual(questSupport.questSupport[PT_BR].intro, [
		"Após o jogador finalizar a Wes Quest, ficará disponível o craft de dois novos itens",
	]);
	assert.deepEqual(questSupport.questSupport[PT_BR].bullets, [
		"Clique na imagem abaixo para ir para a página das Dungeons",
	]);
	assert.deepEqual(questSupport.questSupport[PT_BR].cards.slice(0, 2), [
		{ label: "Alpha Antidote" },
		{ label: "Omega Antidote" },
	]);
});

test("structureSection emits typed quest location sections without raw prose mirrors", () => {
	const locations = publishSection(structureSection(localizedSection({
		id: "localizacao-das-cenouras",
		pageCategory: "quests",
		heading: "Localização das cenouras",
		paragraphs: ["Após coletar as 5 cenouras, retorne ao Goh."],
		items: [
			"Cenoura A | Easter Island",
			"Observação: Para coletar essa cenoura será necessário possuir Fly",
		],
	})));

	assert.equal(locations.content, undefined);
	assert.deepEqual(locations.locations[PT_BR][0].description, [
		"Após coletar as 5 cenouras, retorne ao Goh",
	]);
	assert.deepEqual(locations.locations[PT_BR][0].bullets, [
		"Observação: Para coletar essa cenoura será necessário possuir Fly",
	]);
	assert.deepEqual(locations.locations[PT_BR][0].rows[0], {
		cells: [
			{ text: "Cenoura A" },
			{ text: "Easter Island" },
		],
	});
});

test("structureSection emits typed commerce and dungeon support sections without raw prose mirrors", () => {
	const commerce = publishSection(structureSection(localizedSection({
		id: "crafts",
		pageKind: "craft",
		heading: "Crafts",
		paragraphs: ["Use a bancada para criar os itens."],
		items: [
			"Item | Custo | Resultado",
			"Tech Ball | 10 Iron | 1 Tech Ball",
			"Requer nível de profissão.",
		],
	})));

	assert.equal(commerce.content, undefined);
	assert.equal(commerce.tables, undefined);
	assert.equal(commerce.commerceEntries[PT_BR].type, "craft");
	assert.deepEqual(commerce.commerceEntries[PT_BR].bullets, ["Requer nível de profissão"]);
	assert.deepEqual(commerce.commerceEntries[PT_BR].rows[0], {
		cells: [
			{ text: "Item" },
			{ text: "Custo" },
			{ text: "Resultado" },
		],
	});

	const dungeon = publishSection(structureSection(localizedSection({
		id: "rotacao-dimensional-zone",
		pageCategory: "dimensional-zone",
		heading: "Rotação Dimensional Zone",
		paragraphs: ["A rotação muda semanalmente."],
		items: [
			"Semana | Dungeon",
			"1 | DZ Mega Altaria",
			"Confira os bosses antes de entrar.",
		],
	})));

	assert.equal(dungeon.content, undefined);
	assert.equal(dungeon.tables, undefined);
	assert.equal(dungeon.dungeonSupport[PT_BR].type, "rotation");
	assert.deepEqual(dungeon.dungeonSupport[PT_BR].bullets, ["Confira os bosses antes de entrar"]);
	assert.deepEqual(dungeon.dungeonSupport[PT_BR].rows[1], {
		cells: [
			{ text: "1" },
			{ text: "DZ Mega Altaria" },
		],
	});
});

test("structureSection emits embedded tower progression, unlocks, and linked cards", () => {
	const progression = publishSection(structureSection(localizedSection({
		id: "funcionamento-geral-da-embedded-tower",
		pageCategory: "embedded-tower",
		heading: "Funcionamento geral da Embedded Tower",
		paragraphs: [
			"A Tower possui regras gerais.",
		],
		items: [
			"1º ao 5º Andar | 2 Tower Attempts | 1 Tower Attempts",
			"1º Andar | 150 ao 424 425 ao 449 450 ao 600 | 150.000 de XP 37.500 de XP 18.750 de XP | Tower Points 40 Tower Points",
			"1º Andar | 80 | 12 | Comvip | Semvip | Semvip",
		],
	})));

	assert.equal(progression.content, undefined);
	assert.equal(progression.embeddedTowerProgression[PT_BR].attempts[0].requiredAttempts, 2);
	assert.deepEqual(progression.embeddedTowerProgression[PT_BR].rewards[0].levelRanges, ["150 ao 424", "425 ao 449", "450 ao 600"]);
	assert.deepEqual(progression.embeddedTowerProgression[PT_BR].rewards[0].pointValues, [40]);
	assert.equal(progression.embeddedTowerProgression[PT_BR].resources[0].medicine, "Comvip");

	const unlocks = publishSection(structureSection(localizedSection({
		id: "como-liberar-os-andares",
		pageCategory: "embedded-tower",
		heading: "Como liberar os andares",
		paragraphs: ["Tower Points são usados para desbloquear."],
		items: [
			"Finalize os tablets do andar anterior.",
			"Shiny Magmortar 2º Andar | 50 Tower Points",
		],
	})));

	assert.equal(unlocks.content, undefined);
	assert.deepEqual(unlocks.embeddedTowerUnlocks[PT_BR].bullets, ["Finalize os tablets do andar anterior"]);
	assert.equal(unlocks.embeddedTowerUnlocks[PT_BR].entries[0].bossLabel, "Shiny Magmortar");
	assert.equal(unlocks.embeddedTowerUnlocks[PT_BR].entries[0].floorLabel, "2º Andar");
	assert.equal(unlocks.embeddedTowerUnlocks[PT_BR].entries[0].requiredPoints, 50);

	const floorStructure = publishSection(structureSection(localizedSection({
		id: "primeiro-ao-quarto-andar",
		pageCategory: "embedded-tower",
		heading: "Primeiro ao Quarto Andar",
		paragraphs: ["Os quatro primeiros andares possuem estrutura compartilhada."],
		items: [
			"Andar | Boss | Recompensa",
			"1º Andar | Regirock | Tower Points",
		],
	})));

	assert.equal(floorStructure.content, undefined);
	assert.equal(floorStructure.tables, undefined);
	assert.equal(floorStructure.embeddedTowerSupport[PT_BR].type, "floor-structure");
	assert.deepEqual(floorStructure.embeddedTowerSupport[PT_BR].rows[0], {
		cells: [
			{ text: "Andar" },
			{ text: "Boss" },
			{ text: "Recompensa" },
		],
	});

	const mechanics = publishSection(structureSection(localizedSection({
		id: "mecanicas-do-boss",
		pageCategory: "embedded-tower",
		heading: "Mecânicas do Boss",
		paragraphs: ["O boss alterna entre fases."],
		items: ["Desvie das áreas marcadas."],
	})));

	assert.equal(mechanics.content, undefined);
	assert.equal(mechanics.embeddedTowerSupport[PT_BR].type, "mechanics");
	assert.deepEqual(mechanics.embeddedTowerSupport[PT_BR].bullets, ["Desvie das áreas marcadas"]);

	const linkedCards = publishSection(structureSection(localizedSection({
		id: "bosses",
		pageCategory: "embedded-tower",
		heading: "Bosses",
		paragraphs: [
			"Cada um possui uma mecânica diferenciada. Para saber mais, acesse a página desejada:",
			"Depois disso, o jogador poderá enfrentar o Rayquaza.",
		],
		media: [
			{ type: "image", url: "https://wiki.pokexgames.com/images/1/11/Regirock.png", alt: "Regirock.png", slug: "regirock" },
			{ type: "image", url: "https://wiki.pokexgames.com/images/2/22/Rayquaza.png", alt: "Rayquaza.png", slug: "rayquaza" },
		],
	})));

	assert.equal(linkedCards.content, undefined);
	assert.deepEqual(linkedCards.linkedCards[PT_BR].cards, [
		{ label: "Regirock", slug: "regirock" },
		{ label: "Rayquaza", slug: "rayquaza" },
	]);
	assert.deepEqual(linkedCards.linkedCards[PT_BR].notes, [
		"Depois disso, o jogador poderá enfrentar o Rayquaza",
	]);
});

test("structureSection keeps boss legendary rewards available on normal and hard difficulties", () => {
	const section = structureSection(localizedSection({
		id: "recompensas",
		heading: "Recompensas",
		items: [
			"F\u00e1cil",
			"Entei Legendary sewing thread | Entei Sewing Kit | Lend\u00e1rio",
			"Entei TV Camera | Lend\u00e1rio",
			"Entei Backpack | Lend\u00e1rio",
			"Entei Amulet | Lend\u00e1rio",
			"Normal",
			"Flame-Essence.gif | Flame Essence | Raro",
			"Entei Legendary sewing thread | Entei Sewing Kit | \u00c9pico",
			"Entei Loot Bag | Comum",
			"Dif\u00edcil",
			"Entei Loot Bag | Comum",
		],
	}));

	const rewards = section.rewards[PT_BR];
	for (const difficulty of ["Normal", "Dif\u00edcil"]) {
		const names = rewards.filter((item) => item.difficulty === difficulty).map((item) => item.name);
		assert.ok(names.includes("Entei TV Camera"));
		assert.ok(names.includes("Entei Backpack"));
		assert.ok(names.includes("Entei Amulet"));
	}

	const hardRewards = rewards.filter((item) => item.difficulty === "Dif\u00edcil");
	assert.deepEqual(
		hardRewards.find((item) => item.name === "Entei Sewing Kit")?.rarity,
		"\u00c9pico",
	);
	assert.deepEqual(
		hardRewards.find((item) => item.name === "Flame Essence")?.rarity,
		"Raro",
	);
});

test("publishSection keeps boss recommendation rows normalized instead of raw sprite-prefixed names", () => {
	const section = publishSection(structureSection(localizedSection({
		id: "pokemon-recomendados",
		pageCategory: "boss-fight",
		heading: "Pokémon recomendados",
		paragraphs: [
			"# Tanque",
			"# Causador de Dano",
		],
		items: [
			"0009-Blastoise Blastoise | 095-Onix Big Onix",
			"130-RedGyarados Redgyarados | 208-Steelix Golden Steelix",
		],
		media: [
			{ type: "image", url: "https://wiki.pokexgames.com/images/0/09/Blastoise.png", slug: "blastoise" },
			{ type: "image", url: "https://wiki.pokexgames.com/images/0/95/Big_Onix.png", slug: "big-onix" },
			{ type: "image", url: "https://wiki.pokexgames.com/images/1/30/Red_Gyarados.png", slug: "red-gyarados" },
			{ type: "image", url: "https://wiki.pokexgames.com/images/2/08/Golden_Steelix.png", slug: "golden-steelix" },
		],
	})));

	assert.equal(section.content, undefined);
	assert.deepEqual(section.bossRecommendations[PT_BR].groups, [{
		label: "Tanque",
		notes: [],
		pokemon: ["Blastoise", "Big Onix"],
	}, {
		label: "Causador de Dano",
		notes: [],
		pokemon: ["Red Gyarados", "Golden Steelix"],
	}]);
});
