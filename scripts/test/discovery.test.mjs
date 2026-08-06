import test from "node:test";
import assert from "node:assert/strict";

import { extractArticleHtml, extractArticleWikiLinks } from "../lib/extract.mjs";
import {
	inferDiscoveredPageKind,
	isContentListHeading,
	isPokemonSectionSignature,
	looksLikePokemonDiscoveryCandidate,
	shouldRecurseDiscoveredPage,
	shouldSkipDiscoveredLink,
} from "../lib/discovery.mjs";
import { buildLocalizedText } from "../lib/shared.mjs";
import { loadFixture } from "./helpers.mjs";

test("discovery ignores content-list headings and keeps real boss-fight links", async () => {
	const html = await loadFixture("discovery-root.html");
	const articleHtml = extractArticleHtml(html);
	const links = extractArticleWikiLinks(articleHtml, "https://wiki.pokexgames.com/index.php/Boss_Fight");

	const entei = links.find((link) => link.title === "Entei");
	assert.ok(entei);
	assert.equal(shouldSkipDiscoveredLink({
		link: entei,
		parentEntry: { slug: "boss-fight", title: buildLocalizedText("Boss Fight") },
		rootEntry: { slug: "boss-fight" },
		seenSlugs: new Set(["boss-fight"]),
		excludeSlugs: new Set(),
		excludeTitles: new Set(),
	}), false);

	const indexLink = links.find((link) => link.title === "Should Not Appear");
	assert.ok(indexLink);
	assert.equal(shouldSkipDiscoveredLink({
		link: indexLink,
		parentEntry: { slug: "boss-fight", title: buildLocalizedText("Boss Fight") },
		rootEntry: { slug: "boss-fight" },
		seenSlugs: new Set(["boss-fight"]),
		excludeSlugs: new Set(),
		excludeTitles: new Set(),
	}), true);
});

test("discovery keeps dimensional dungeon links even when the wiki places them under index", () => {
	const link = {
		url: "https://wiki.pokexgames.com/index.php/DZ_Cradily",
		title: "DZ Cradily",
		label: "DZ Cradily",
		headingPath: ["\u00cdndice"],
	};

	assert.equal(shouldSkipDiscoveredLink({
		link,
		parentEntry: { slug: "spoiler-das-masmorras", title: buildLocalizedText("Spoiler das Masmorras") },
		rootEntry: { slug: "dimensional-zone", category: "dimensional-zone" },
		seenSlugs: new Set(["dimensional-zone", "spoiler-das-masmorras"]),
		excludeSlugs: new Set(),
		excludeTitles: new Set(),
	}), false);
});

test("discovery helper infers kinds and recursion policy correctly", () => {
	assert.equal(isContentListHeading("\u00cdndice"), true);
	assert.equal(isContentListHeading("Arena principal"), false);

	assert.equal(
		inferDiscoveredPageKind("", { headingPath: ["Workshop"] }, "Blacksmith Workshop"),
		"workshop",
	);

	assert.equal(
		inferDiscoveredPageKind("", { headingPath: ["Mapas"] }, "Johto Map"),
		"map",
	);

	assert.equal(
		shouldRecurseDiscoveredPage({ pageKind: "map", title: buildLocalizedText("Johto Map") }, 1),
		false,
	);

	assert.equal(
		shouldRecurseDiscoveredPage({ pageKind: "article", title: buildLocalizedText("Entei (EN)") }, 1),
		false,
	);

	assert.equal(
		shouldRecurseDiscoveredPage({ pageKind: "article", title: buildLocalizedText("Embedded Tower EN") }, 1),
		false,
	);

	assert.equal(
		shouldRecurseDiscoveredPage({ pageKind: "article", title: buildLocalizedText("Entei") }, 1),
		true,
	);
});

test("pokemon discovery helpers identify likely pokemon pages", () => {
	assert.equal(looksLikePokemonDiscoveryCandidate("Dragonite"), true);
	assert.equal(looksLikePokemonDiscoveryCandidate("Shiny Dragonite"), true);
	assert.equal(looksLikePokemonDiscoveryCandidate("Dragonite Bag"), false);
	assert.equal(looksLikePokemonDiscoveryCandidate("Arcade 2026"), false);

	assert.equal(isPokemonSectionSignature([
		{ line: "<b>Informa\u00e7\u00f5es Gerais</b>" },
		{ line: "<b>Movimentos</b>" },
		{ line: "<b>Efetividades</b>" },
	]), true);

	assert.equal(isPokemonSectionSignature([
		{ line: "<b>Introdu\u00e7\u00e3o</b>" },
		{ line: "<b>Recompensas</b>" },
	]), false);
});

test("discovery keeps linked image cards under index headings for boss fights and daily missions", () => {
	for (const category of ["boss-fight", "daily-missions"]) {
		assert.equal(shouldSkipDiscoveredLink({
			link: {
				url: "https://wiki.pokexgames.com/index.php/Lavender%27s_Curse",
				title: "Lavender's Curse",
				label: "Lavender's Curse",
				headingPath: ["Índice"],
				hasImage: true,
			},
			parentEntry: { slug: category, title: buildLocalizedText(category) },
			rootEntry: { slug: category, category },
			seenSlugs: new Set([category]),
			excludeSlugs: new Set(),
			excludeTitles: new Set(),
		}), false);
	}
});
test("wiki-wide hub pages are not adopted as children of another category", () => {
	const base = {
		parentEntry: { slug: "entei" },
		rootEntry: { slug: "boss-fight", category: "boss-fight" },
		seenSlugs: new Set(),
		excludeSlugs: new Set(),
		excludeTitles: new Set(),
	};

	// "Pokémon TM" linked from a boss page previously produced a junk boss-fight page.
	assert.equal(shouldSkipDiscoveredLink({ ...base, link: { title: "Pokémon", label: "Pokémon TM" } }), true);
	assert.equal(shouldSkipDiscoveredLink({ ...base, link: { title: "Clãs", label: "Clan Tasks" } }), true);

	// A real child link is still discovered.
	assert.equal(shouldSkipDiscoveredLink({ ...base, link: { title: "Raikou", label: "Raikou" } }), false);
});

test("a hub page is still discovered when it is the root of its own tree", () => {
	assert.equal(
		shouldSkipDiscoveredLink({
			link: { title: "Clãs", label: "Clãs" },
			parentEntry: { slug: "wiki-root" },
			rootEntry: { slug: "clas", category: "clans" },
			seenSlugs: new Set(),
			excludeSlugs: new Set(),
			excludeTitles: new Set(),
		}),
		true,
		"matches rootEntry.slug so it is skipped as a self-link, not adopted twice"
	);
});
