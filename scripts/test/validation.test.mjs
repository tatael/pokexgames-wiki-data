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
