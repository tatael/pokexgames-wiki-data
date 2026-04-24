import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { validateBundle } from "../lib/validation.mjs";
import { withTempDir } from "./helpers.mjs";

async function writeJson(filePath, value) {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildBundle({ title = "Absol", includeProfile = true, pageKind = "pokemon" } = {}) {
	const images = {
		sprite: { url: "https://wiki.pokexgames.com/images/f/f6/359_-_Absol.png" },
		hero: { url: "https://wiki.pokexgames.com/images/f/f6/359_-_Absol.gif" },
	};

	const page = {
		category: "pokemon",
		slug: "absol",
		url: "https://wiki.pokexgames.com/index.php/Absol",
		source: "PokeXGames Wiki",
		fetchedAt: "2026-04-15T00:00:00.000Z",
		pageKind,
		title: { "pt-BR": title, en: "Absol", es: "Absol" },
		summary: { "pt-BR": "Resumo", en: "Resumo", es: "Resumo" },
		images,
		sections: [{ id: "informacoes-gerais", kind: "info", title: { "pt-BR": "Informações Gerais", en: "Informações Gerais", es: "Informações Gerais" }, content: { "pt-BR": { paragraphs: ["Nome: Absol"] }, en: { paragraphs: ["Nome: Absol"] }, es: { paragraphs: ["Nome: Absol"] } }, tables: { "pt-BR": [{ type: "table", rows: [{ cells: [{ text: "Nome" }, { text: "Absol" }] }] }] } }],
	};

	if (includeProfile) {
		page.profile = { "pt-BR": { name: "Absol" }, en: { name: "Absol" }, es: { name: "Absol" } };
	}

	const manifest = {
		schemaVersion: 2,
		source: "PokeXGames Wiki",
		updatedAt: "2026-04-15T00:00:00.000Z",
		categories: [{ id: "pokemon", label: { "pt-BR": "Pokémon", en: "Pokemon", es: "Pokemon" } }],
		mediaPath: "media.json",
		pages: [{
			category: "pokemon",
			slug: "absol",
			url: "https://wiki.pokexgames.com/index.php/Absol",
			pageKind,
			title: { "pt-BR": title, en: "Absol", es: "Absol" },
			summary: { "pt-BR": "Resumo", en: "Resumo", es: "Resumo" },
			images,
			fetchedAt: "2026-04-15T00:00:00.000Z",
			...(includeProfile ? { profile: { "pt-BR": { name: "Absol" }, en: { name: "Absol" }, es: { name: "Absol" } } } : {}),
			pagePath: "pokemon/absol.json",
		}],
	};

	return { manifest, page };
}

test("validateBundle accepts a well-formed pokemon bundle", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle();
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "pokemon", "absol.json"), page);
		await assert.doesNotReject(() => validateBundle(tempDir));
	});
});

test("validateBundle accepts compact localized payloads", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle();
		manifest.categories[0].label = { "pt-BR": "Pokémon" };
		manifest.pages[0].title = { "pt-BR": "Absol" };
		manifest.pages[0].summary = { "pt-BR": "Resumo" };
		page.title = { "pt-BR": "Absol" };
		page.summary = { "pt-BR": "Resumo" };
		page.sections[0].title = { "pt-BR": "Informações Gerais" };
		page.sections[0].content = { "pt-BR": { paragraphs: ["Nome: Absol"] } };
		page.sections[0].tables = { "pt-BR": [{ type: "table", rows: [{ cells: [{ text: "Nome" }, { text: "Absol" }] }] }] };
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "pokemon", "absol.json"), page);
		await assert.doesNotReject(() => validateBundle(tempDir));
	});
});

test("validateBundle rejects pokemon pages missing a profile", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ includeProfile: false });
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "pokemon", "absol.json"), page);
		await assert.rejects(() => validateBundle(tempDir), /must contain a profile/);
	});
});

test("validateBundle rejects mojibake in localized fields", async () => {
	await withTempDir(async (tempDir) => {
		const brokenTitle = Buffer.from("Pokémon Absol", "utf8").toString("latin1");
		const { manifest, page } = buildBundle({ title: brokenTitle });
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "pokemon", "absol.json"), page);
		await assert.rejects(() => validateBundle(tempDir), /broken text encoding/);
	});
});

test("validateBundle rejects non-https image urls", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle();
		manifest.pages[0].images.sprite.url = "http://example.com/absol.png";
		page.images.sprite.url = "http://example.com/absol.png";
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "pokemon", "absol.json"), page);
		await assert.rejects(() => validateBundle(tempDir), /images\.sprite\.url must be an https url/);
	});
});

test("validateBundle accepts structured object section payloads", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ pageKind: "article", includeProfile: false });
		page.category = "held-items";
		page.slug = "held-items";
		page.url = "https://wiki.pokexgames.com/index.php/Held_Items";
		page.sections = [{
			id: "categories",
			kind: "prose",
			title: { "pt-BR": "Categories", en: "Categories", es: "Categories" },
			heldCategories: {
				"pt-BR": { groups: [{ name: "Offensive", entries: [] }] },
				en: { groups: [{ name: "Offensive", entries: [] }] },
				es: { groups: [{ name: "Offensive", entries: [] }] },
			},
		}];
		manifest.categories = [{ id: "held-items", label: { "pt-BR": "Held Items", en: "Held Items", es: "Held Items" } }];
		manifest.pages[0] = {
			category: "held-items",
			slug: "held-items",
			url: "https://wiki.pokexgames.com/index.php/Held_Items",
			pageKind: "article",
			title: { "pt-BR": "Held Items", en: "Held Items", es: "Held Items" },
			summary: { "pt-BR": "Resumo", en: "Resumo", es: "Resumo" },
			images: manifest.pages[0].images,
			fetchedAt: "2026-04-15T00:00:00.000Z",
			pagePath: "held-items/held-items.json",
		};
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "held-items", "held-items.json"), page);
		await assert.doesNotReject(() => validateBundle(tempDir));
	});
});

test("validateBundle accepts nested typed step and held payloads", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ pageKind: "article", includeProfile: false });
		page.category = "boss-fight";
		page.slug = "boss-fight-entei";
		page.url = "https://wiki.pokexgames.com/index.php/Boss_Fight_-_Entei";
		page.sections = [{
			id: "dificuldades",
			kind: "prose",
			title: { "pt-BR": "Dificuldades" },
			difficulties: {
				"pt-BR": {
					intro: ["Introdução"],
					entries: [{
						name: "Fácil",
						description: "Descrição",
						minimumLevel: 200,
						recommendedLevel: 250,
						levelCap: 350,
						objective: "Derrotar o boss",
						entryRequirement: {
							amount: 1,
							name: "Entei Charm",
						},
					}],
					notes: ["Observação"],
				},
			},
		}, {
			id: "held-enhancement",
			kind: "info",
			title: { "pt-BR": "Held Enhancement" },
			heldEnhancement: {
				"pt-BR": {
					intro: ["Introdução"],
					entries: [{
						difficulty: "Normal",
						description: "Descrição",
						tiers: [{
							tier: 6,
							damageBonus: 35,
							defenseBonus: 35,
						}],
					}],
					notes: ["Observação"],
				},
			},
		}, {
			id: "fusao-de-held-item",
			kind: "prose",
			title: { "pt-BR": "Fusão de Held Item" },
			steps: {
				"pt-BR": [{
					index: 1,
					title: "Observações importantes",
					bullets: ["Os Held Itens precisam ser do mesmo tier."],
					rows: [{
						cells: [
							{ text: "Tier 1 para Tier 2" },
							{ text: "60.000 dólares" },
						],
					}],
				}],
			},
		}, {
			id: "categories",
			kind: "prose",
			title: { "pt-BR": "Categories" },
			heldCategories: {
				"pt-BR": {
					groups: [{
						name: "Offensive",
						entries: [{
							name: "X-Attack",
							description: "Increases damage.",
							tiers: [{ tier: 1, value: "8%" }],
						}],
					}],
				},
			},
		}];
		manifest.categories = [{ id: "boss-fight", label: { "pt-BR": "Boss Fight" } }];
		manifest.pages[0] = {
			category: "boss-fight",
			slug: "boss-fight-entei",
			url: "https://wiki.pokexgames.com/index.php/Boss_Fight_-_Entei",
			pageKind: "article",
			title: { "pt-BR": "Boss Fight - Entei" },
			summary: { "pt-BR": "Resumo" },
			images: manifest.pages[0].images,
			fetchedAt: "2026-04-15T00:00:00.000Z",
			pagePath: "boss-fight/boss-fight-entei.json",
		};
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "boss-fight", "boss-fight-entei.json"), page);
		await assert.doesNotReject(() => validateBundle(tempDir));
	});
});

test("validateBundle rejects malformed nested typed section payloads", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ pageKind: "article", includeProfile: false });
		page.category = "held-items";
		page.slug = "held-itens";
		page.url = "https://wiki.pokexgames.com/index.php/Held_Itens";
		page.sections = [{
			id: "fusao-de-held-item",
			kind: "prose",
			title: { "pt-BR": "Fusão de Held Item" },
			steps: {
				"pt-BR": [{
					index: 1,
					title: "Observações importantes",
					rows: [{
						cells: [
							{ text: "Tier 1 para Tier 2" },
						],
					}],
				}],
			},
		}];
		manifest.categories = [{ id: "held-items", label: { "pt-BR": "Held Itens" } }];
		manifest.pages[0] = {
			category: "held-items",
			slug: "held-itens",
			url: "https://wiki.pokexgames.com/index.php/Held_Itens",
			pageKind: "article",
			title: { "pt-BR": "Held Itens" },
			summary: { "pt-BR": "Resumo" },
			images: manifest.pages[0].images,
			fetchedAt: "2026-04-15T00:00:00.000Z",
			pagePath: "held-items/held-itens.json",
		};
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "held-items", "held-itens.json"), page);
		await assert.rejects(() => validateBundle(tempDir), /cells must contain at least two cells/);
	});
});

test("validateBundle rejects malformed difficulty and held enhancement fields", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ pageKind: "article", includeProfile: false });
		page.category = "boss-fight";
		page.slug = "boss-fight-entei";
		page.url = "https://wiki.pokexgames.com/index.php/Boss_Fight_-_Entei";
		page.sections = [{
			id: "dificuldades",
			kind: "prose",
			title: { "pt-BR": "Dificuldades" },
			difficulties: {
				"pt-BR": {
					entries: [{
						name: "Fácil",
						minimumLevel: "200",
					}],
				},
			},
		}, {
			id: "held-enhancement",
			kind: "info",
			title: { "pt-BR": "Held Enhancement" },
			heldEnhancement: {
				"pt-BR": {
					entries: [{
						difficulty: "Normal",
						tiers: [{
							tier: 6,
							damageBonus: -1,
						}],
					}],
				},
			},
		}];
		manifest.categories = [{ id: "boss-fight", label: { "pt-BR": "Boss Fight" } }];
		manifest.pages[0] = {
			category: "boss-fight",
			slug: "boss-fight-entei",
			url: page.url,
			pageKind: "article",
			title: { "pt-BR": "Boss Fight - Entei" },
			summary: { "pt-BR": "Resumo" },
			images: manifest.pages[0].images,
			fetchedAt: "2026-04-15T00:00:00.000Z",
			pagePath: "boss-fight/boss-fight-entei.json",
		};
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "boss-fight", "boss-fight-entei.json"), page);
		await assert.rejects(() => validateBundle(tempDir), /minimumLevel must be a positive integer/);
	});
});

test("validateBundle accepts embedded tower structured payloads", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ pageKind: "article", includeProfile: false });
		page.category = "embedded-tower";
		page.slug = "funcionamento-da-embedded-tower";
		page.url = "https://wiki.pokexgames.com/index.php/How_Embedded_Tower_Works";
		page.sections = [{
			id: "funcionamento-geral-da-embedded-tower",
			kind: "prose",
			title: { "pt-BR": "Funcionamento geral da Embedded Tower" },
			embeddedTowerProgression: {
				"pt-BR": {
					intro: ["Introdução"],
					attempts: [{ floorsLabel: "1º ao 5º Andar", requiredAttempts: 2, refundedAttempts: 1 }],
					rewards: [{
						floorLabel: "1º Andar",
						levelRanges: ["150 ao 424"],
						experienceValues: ["150.000 de XP"],
						pointType: "Tower Points",
						pointValues: [40],
					}],
					resources: [{
						floorLabel: "1º Andar",
						potionsAndElixirs: "80",
						revives: "12",
						medicine: "Comvip",
						deathPenalty: "Semvip",
						berries: "Semvip",
					}],
				},
			},
		}, {
			id: "como-liberar-os-andares",
			kind: "prose",
			title: { "pt-BR": "Como liberar os andares" },
			embeddedTowerUnlocks: {
				"pt-BR": {
					intro: ["Introdução"],
					bullets: ["Finalize os tablets."],
					entries: [{
						bossLabel: "Shiny Magmortar",
						floorLabel: "2º Andar",
						requirementText: "50 Tower Points",
						requiredPoints: 50,
					}],
				},
			},
		}, {
			id: "bosses",
			kind: "prose",
			title: { "pt-BR": "Bosses" },
			linkedCards: {
				"pt-BR": {
					intro: ["Introdução"],
					cards: [{ label: "Regirock", slug: "regirock" }],
					notes: ["Observação"],
				},
			},
		}];
		manifest.categories = [{ id: "embedded-tower", label: { "pt-BR": "Embedded Tower" } }];
		manifest.pages[0] = {
			category: "embedded-tower",
			slug: "funcionamento-da-embedded-tower",
			url: page.url,
			pageKind: "article",
			title: { "pt-BR": "Como Funciona" },
			summary: { "pt-BR": "Resumo" },
			images: manifest.pages[0].images,
			fetchedAt: "2026-04-15T00:00:00.000Z",
			pagePath: "embedded-tower/funcionamento-da-embedded-tower.json",
		};
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "embedded-tower", "funcionamento-da-embedded-tower.json"), page);
		await assert.doesNotReject(() => validateBundle(tempDir));
	});
});

test("validateBundle accepts section media refs backed by media registry", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ pageKind: "article", includeProfile: false });
		page.category = "boss-fight";
		page.slug = "entei";
		page.url = "https://wiki.pokexgames.com/index.php/Entei";
		page.sections = [{
			id: "introducao",
			kind: "prose",
			title: { "pt-BR": "Introdução" },
			content: { "pt-BR": { paragraphs: ["Texto"] } },
			mediaRefs: { "pt-BR": ["m-1"] },
		}];
		manifest.categories = [{ id: "boss-fight", label: { "pt-BR": "Boss Fight" } }];
		manifest.pages[0] = {
			category: "boss-fight",
			slug: "entei",
			url: "https://wiki.pokexgames.com/index.php/Entei",
			pageKind: "article",
			title: { "pt-BR": "Entei" },
			summary: { "pt-BR": "Resumo" },
			images: manifest.pages[0].images,
			fetchedAt: "2026-04-15T00:00:00.000Z",
			pagePath: "boss-fight/entei.json",
		};
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), {
			entries: [{ id: "m-1", type: "image", url: "https://wiki.pokexgames.com/images/e/eb/244-Entei.png", alt: "Entei" }],
		});
		await writeJson(path.join(tempDir, "pages", "boss-fight", "entei.json"), page);
		await assert.doesNotReject(() => validateBundle(tempDir));
	});
});

test("validateBundle rejects quest pages that regress to generic-only sections", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ pageKind: "quest", includeProfile: false });
		page.category = "quests";
		page.slug = "wes-quest";
		page.url = "https://wiki.pokexgames.com/index.php/Wes_Quest";
		page.sections = [{
			id: "introducao",
			kind: "prose",
			title: { "pt-BR": "Introdução" },
			content: { "pt-BR": { paragraphs: ["Texto solto"] } },
		}];
		manifest.categories = [{ id: "quests", label: { "pt-BR": "Quests" } }];
		manifest.pages[0] = {
			category: "quests",
			slug: "wes-quest",
			url: page.url,
			pageKind: "quest",
			title: { "pt-BR": "Wes Quest" },
			summary: { "pt-BR": "Resumo" },
			images: manifest.pages[0].images,
			fetchedAt: "2026-04-15T00:00:00.000Z",
			pagePath: "quests/wes-quest.json",
		};
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "quests", "wes-quest.json"), page);
		await assert.rejects(() => validateBundle(tempDir), /must contain typed quest sections/);
	});
});

test("validateBundle rejects clan task pages without clanTasks payloads", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ pageKind: "article", includeProfile: false });
		page.category = "clans";
		page.slug = "gardestrike-tasks";
		page.url = "https://wiki.pokexgames.com/index.php/Gardestrike";
		page.sections = [{
			id: "ver-tasks-do-cla",
			kind: "prose",
			title: { "pt-BR": "Ver tasks do clã" },
			content: { "pt-BR": { paragraphs: ["Texto solto"] } },
		}];
		manifest.categories = [{ id: "clans", label: { "pt-BR": "Clãs" } }];
		manifest.pages[0] = {
			category: "clans",
			slug: "gardestrike-tasks",
			url: page.url,
			pageKind: "article",
			title: { "pt-BR": "Gardestrike" },
			summary: { "pt-BR": "Resumo" },
			images: manifest.pages[0].images,
			fetchedAt: "2026-04-15T00:00:00.000Z",
			pagePath: "clans/gardestrike-tasks.json",
		};
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), { entries: [] });
		await writeJson(path.join(tempDir, "pages", "clans", "gardestrike-tasks.json"), page);
		await assert.rejects(() => validateBundle(tempDir), /must publish a clanTasks payload/);
	});
});

test("validateBundle rejects duplicate media registry ids", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ pageKind: "article", includeProfile: false });
		page.category = "boss-fight";
		page.slug = "entei";
		page.url = "https://wiki.pokexgames.com/index.php/Entei";
		page.sections = [{
			id: "introducao",
			kind: "prose",
			title: { "pt-BR": "Introdução" },
			content: { "pt-BR": { paragraphs: ["Texto"] } },
			mediaRefs: { "pt-BR": ["m-1"] },
		}];
		manifest.categories = [{ id: "boss-fight", label: { "pt-BR": "Boss Fight" } }];
		manifest.pages[0] = {
			category: "boss-fight",
			slug: "entei",
			url: page.url,
			pageKind: "article",
			title: { "pt-BR": "Entei" },
			summary: { "pt-BR": "Resumo" },
			images: manifest.pages[0].images,
			fetchedAt: "2026-04-15T00:00:00.000Z",
			pagePath: "boss-fight/entei.json",
		};
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "media.json"), {
			entries: [
				{ id: "m-1", type: "image", url: "https://wiki.pokexgames.com/images/e/eb/244-Entei.png", alt: "Entei" },
				{ id: "m-1", type: "image", url: "https://wiki.pokexgames.com/images/e/eb/245-Suicune.png", alt: "Suicune" },
			],
		});
		await writeJson(path.join(tempDir, "pages", "boss-fight", "entei.json"), page);
		await assert.rejects(() => validateBundle(tempDir), /duplicate id "m-1"/);
	});
});
