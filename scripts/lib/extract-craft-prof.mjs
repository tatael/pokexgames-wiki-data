// The wiki moved the profession craft recipes out of HTML tables and into a
// client-side widget that assigns `window.CraftProfData = { items, professions }`.
// The old table scraper finds nothing on those pages, so the recipes are read from
// that payload here — the same approach `extract-flex-tasks.mjs` takes for the
// FlexibleList task pages.

const CRAFT_DATA_ASSIGNMENT = /window\.CraftProfData\s*=\s*\{/;

function sliceBalancedObject(source, startIdx) {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = startIdx; index < source.length; index += 1) {
		const char = source[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === '"') inString = false;
			continue;
		}

		if (char === '"') inString = true;
		else if (char === "{") depth += 1;
		else if (char === "}") {
			depth -= 1;
			if (depth === 0) return source.slice(startIdx, index + 1);
		}
	}

	return null;
}

function stripTrailingCommas(value) {
	return String(value ?? "").replace(/,(\s*[}\]])/g, "$1");
}

export function extractCraftProfData(html) {
	const source = String(html ?? "");
	const match = CRAFT_DATA_ASSIGNMENT.exec(source);
	if (!match) return null;
	const startIdx = match.index + match[0].length - 1;
	const slice = sliceBalancedObject(source, startIdx);
	if (!slice) return null;
	try {
		const parsed = JSON.parse(stripTrailingCommas(slice));
		if (!parsed?.items || !parsed?.professions) return null;
		return parsed;
	} catch {
		return null;
	}
}

function formatDuration(seconds) {
	const total = Number(seconds);
	if (!Number.isFinite(total) || total <= 0) return "";
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = Math.round(total % 60);
	const parts = [];
	if (hours) parts.push(`${hours}h`);
	if (minutes) parts.push(`${minutes}min`);
	if (secs && !hours) parts.push(`${secs}s`);
	return parts.join(" ");
}

function itemName(items, itemId) {
	const entry = items?.[itemId];
	const name = String(entry?.name ?? "").trim();
	if (name) return name;
	// Fall back to the id so a recipe is never dropped just because the item
	// catalogue is missing one row.
	return String(itemId ?? "")
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

// Produces the same entry shape as the table-based `parseCraftEntries`, so the
// overlay's craft calculator keeps working unchanged.
export function buildCraftEntries(data, professionKey) {
	const items = data?.items ?? {};
	const profession = data?.professions?.[professionKey];
	const recipes = profession?.recipes ?? [];
	const entries = [];

	for (const recipe of recipes) {
		const name = itemName(items, recipe?.result_item_id);
		if (!name) continue;
		const ingredients = (recipe?.materials ?? [])
			.map((material) => {
				const materialName = itemName(items, material?.item_id);
				const amount = Number(material?.count);
				if (!materialName || !Number.isFinite(amount) || amount <= 0) return null;
				return { name: materialName, amount };
			})
			.filter(Boolean);
		if (!ingredients.length) continue;

		const quantity = Number(recipe?.result_count);
		const entry = {
			result: { name, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1 },
			skill: Number.isFinite(Number(recipe?.skill_required)) ? Number(recipe.skill_required) : null,
			duration: formatDuration(recipe?.time_seconds),
			ingredients,
		};
		const rank = String(recipe?.rank ?? "").trim();
		if (rank) entry.rank = `Rank ${rank}`;
		entries.push(entry);
	}

	return entries;
}

export function listProfessionKeys(data) {
	return Object.keys(data?.professions ?? {});
}

function normalizeHint(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase();
}

// The payload keys professions in English while the pages are titled in Portuguese.
const PROFESSION_ALIASES = new Map([
	["aventureiro", "adventurer"],
	["adventurer", "adventurer"],
	["engenheiro", "engineer"],
	["engineer", "engineer"],
	["estilista", "estilista"],
	["stylist", "estilista"],
	["professor", "professor"],
]);

// Craft pages are named after the profession ("Craft Profissões - Aventureiro"), so the
// hint is matched against the aliases first, then the payload's own display name, then
// the raw key.
export function resolveProfessionKey(data, hint) {
	const token = normalizeHint(hint);
	if (!token) return null;
	const professions = data?.professions ?? {};

	for (const [alias, key] of PROFESSION_ALIASES) {
		if (professions[key] && new RegExp(`\\b${alias}\\b`).test(token)) return key;
	}

	for (const [key, value] of Object.entries(professions)) {
		const name = normalizeHint(value?.name);
		if (name && token.includes(name)) return key;
	}

	for (const key of Object.keys(professions)) {
		if (token.includes(key.toLowerCase())) return key;
	}

	return null;
}
