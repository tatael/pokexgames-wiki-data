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
		sections: [{ id: "informacoes-gerais", heading: { "pt-BR": "Informações Gerais", en: "Informações Gerais", es: "Informações Gerais" }, paragraphs: { "pt-BR": ["Nome: Absol"], en: ["Nome: Absol"], es: ["Nome: Absol"] }, items: { "pt-BR": [], en: [], es: [] } }],
	};

	if (includeProfile) {
		page.profile = { "pt-BR": { name: "Absol" }, en: { name: "Absol" }, es: { name: "Absol" } };
	}

	const manifest = {
		schemaVersion: 1,
		source: "PokeXGames Wiki",
		updatedAt: "2026-04-15T00:00:00.000Z",
		categories: [{ id: "pokemon", label: { "pt-BR": "Pokémon", en: "Pokemon", es: "Pokemon" } }],
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
		await writeJson(path.join(tempDir, "pages", "pokemon", "absol.json"), page);
		await assert.doesNotReject(() => validateBundle(tempDir));
	});
});

test("validateBundle rejects pokemon pages missing a profile", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ includeProfile: false });
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
		await writeJson(path.join(tempDir, "pages", "pokemon", "absol.json"), page);
		await assert.rejects(() => validateBundle(tempDir), /must contain a profile/);
	});
});

test("validateBundle rejects mojibake in localized fields", async () => {
	await withTempDir(async (tempDir) => {
		const { manifest, page } = buildBundle({ title: "PokÃƒÂ©mon Absol" });
		await writeJson(path.join(tempDir, "manifest.json"), manifest);
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
		await writeJson(path.join(tempDir, "pages", "pokemon", "absol.json"), page);
		await assert.rejects(() => validateBundle(tempDir), /images\.sprite\.url must be an https url/);
	});
});
