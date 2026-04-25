import path from "node:path";

import { buildSlug, readJson, writeJson } from "./shared.mjs";

const REGISTRY_PATHS = {
	items: "registries/items.json",
	pokemon: "registries/pokemon.json",
	npcs: "registries/npcs.json",
	definitions: "registries/definitions.json",
	linkedCards: "registries/linked-cards.json",
};

function addEntry(map, name, pageSlug, extra = {}) {
	const label = String(name ?? "").trim();
	if (!label) return;
	const id = buildSlug(label, "");
	if (!id) return;
	const existing = map.get(id) ?? { id, label, pages: [] };
	if (extra.slug && !existing.slug) existing.slug = extra.slug;
	if (extra.kind && !existing.kind) existing.kind = extra.kind;
	if (pageSlug && !existing.pages.includes(pageSlug)) existing.pages.push(pageSlug);
	map.set(id, existing);
}

function addRewardItems(map, rewards = [], pageSlug) {
	for (const reward of rewards ?? []) {
		if (reward?.name) addEntry(map, reward.name, pageSlug, { slug: reward.slug, kind: reward.type });
		addRewardItems(map, reward?.prizes ?? [], pageSlug);
	}
}

function collectFromSection(section, pageSlug, registries) {
	for (const values of Object.values(section.rewards ?? {})) {
		addRewardItems(registries.items, values, pageSlug);
	}

	for (const payload of Object.values(section.commerceEntries ?? {})) {
		for (const row of payload?.rows ?? []) {
			for (const cell of row?.cells ?? []) addEntry(registries.items, cell?.text ?? cell?.raw, pageSlug, { kind: payload.type });
		}
	}

	for (const values of Object.values(section.pokemon ?? {})) {
		for (const pokemon of values ?? []) addEntry(registries.pokemon, pokemon?.name, pageSlug);
	}

	for (const payload of Object.values(section.bossRecommendations ?? {})) {
		for (const group of payload?.groups ?? []) {
			for (const pokemon of group?.pokemon ?? []) addEntry(registries.pokemon, pokemon, pageSlug);
		}
	}

	for (const values of Object.values(section.tasks ?? {})) {
		for (const task of values ?? []) {
			if (task?.npc) addEntry(registries.npcs, task.npc, pageSlug);
			for (const target of task?.objectiveDetails?.targets ?? []) addEntry(registries.pokemon, target?.name, pageSlug, { slug: target?.slug });
			addRewardItems(registries.items, task?.rewards ?? [], pageSlug);
		}
	}

	for (const payload of Object.values(section.questPhases ?? {})) {
		for (const npc of payload?.npcs ?? []) addEntry(registries.npcs, npc, pageSlug);
		addRewardItems(registries.items, payload?.rewards ?? [], pageSlug);
	}

	for (const payload of Object.values(section.clanTasks ?? {})) {
		for (const rank of payload?.ranks ?? []) {
			addRewardItems(registries.items, rank?.rewards ?? [], pageSlug);
			for (const stage of rank?.stages ?? []) {
				for (const row of stage?.rows ?? []) addEntry(registries.items, row?.item, pageSlug);
				for (const target of stage?.targets ?? []) addEntry(registries.pokemon, target?.name, pageSlug);
			}
		}
	}

	for (const values of Object.values(section.facts ?? {})) {
		for (const fact of values ?? []) addEntry(registries.definitions, fact?.label, pageSlug);
	}

	for (const payload of Object.values(section.linkedCards ?? {})) {
		for (const card of payload?.cards ?? []) addEntry(registries.linkedCards, card?.label, pageSlug, { slug: card?.slug });
	}
}

function serializeRegistry(map) {
	return {
		entries: [...map.values()]
			.map((entry) => ({ ...entry, pages: entry.pages.sort() }))
			.sort((left, right) => left.id.localeCompare(right.id)),
	};
}

export async function buildCanonicalRegistries(pagePaths = [], pagesRootDir, outputRootDir) {
	const registries = {
		items: new Map(),
		pokemon: new Map(),
		npcs: new Map(),
		definitions: new Map(),
		linkedCards: new Map(),
	};

	for (const pagePath of pagePaths) {
		const page = await readJson(path.join(pagesRootDir, ...String(pagePath ?? "").split("/")));
		if (page.profile) {
			for (const profile of Object.values(page.profile ?? {})) {
				addEntry(registries.pokemon, profile?.name, page.slug, { slug: page.slug });
			}
		}

		for (const section of page.sections ?? []) {
			collectFromSection(section, page.slug, registries);
		}
	}

	for (const [key, registryPath] of Object.entries(REGISTRY_PATHS)) {
		await writeJson(path.join(outputRootDir, ...registryPath.split("/")), serializeRegistry(registries[key]));
	}

	return REGISTRY_PATHS;
}
