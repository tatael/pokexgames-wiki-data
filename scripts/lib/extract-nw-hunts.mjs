// The Nightmare World hunting-spot index is a JS widget: the article body is two
// `{{#widget:…}}` calls and nothing else, so discovery walked it, found zero links, and the
// bundle carried one prose page where the wiki has 106 hunting spots. Every detail page —
// each with its recommended clans, its resistance city, its super-effective element and its
// minimap screenshots — was invisible to the overlay.
//
// The widget's data is a plain `const hunts = { "NW": [ … ] }` literal in the rendered HTML,
// so it reads without executing anything. This module publishes it as a typed payload and
// hands discovery the child links it could not see.

import { extractJsLiteral } from "./extract-js-literal.mjs";

// The wiki writes clan and element names as display labels. Every consumer keys on the
// lowercase form, and mixing the two has broken this codebase three separate times (element
// icons, the picker filter, the element tabs), so normalization happens once, here.
function keyOf(value) {
	return String(value ?? "").trim().toLowerCase();
}

function cleanText(value) {
	return String(value ?? "").replace(/\s+/g, " ").trim();
}

function asList(value) {
	if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
	const single = cleanText(value);
	return single ? [single] : [];
}

// "Todos" is the wiki's way of saying the spot suits every clan (Sentinel, Darkrai Minion,
// Mecha). Publishing it as a clan named "todos" would put a phantom clan in every filter.
const ALL_TOKEN = /^(?:todos|todas|all)(?![a-z])/i;

// Three spots are typed "Neutral", which is not an element — it means the Pokémon there deal
// neutral damage to everyone, so no clan is favoured and no coverage answer applies.
const NEUTRAL_TOKEN = /^(?:neutral|neutro)$/i;

export function huntTitleFromLink(link) {
	const raw = cleanText(link);
	if (!raw) return "";
	const marker = raw.indexOf("/index.php/");
	const tail = marker >= 0 ? raw.slice(marker + "/index.php/".length) : raw;
	let decoded = tail;
	try {
		decoded = decodeURIComponent(tail);
	} catch {
		// A malformed escape means the wiki wrote the title raw; use it as-is.
	}

	return decoded.replaceAll("_", " ").trim();
}

function normalizeSpot(entry) {
	const name = cleanText(entry?.name);
	const title = huntTitleFromLink(entry?.link);
	if (!name || !title) return null;

	const clanLabels = asList(entry?.classes);
	const everyClan = clanLabels.some((label) => ALL_TOKEN.test(label));
	const elementLabels = asList(entry?.huntTypes);
	const neutral = elementLabels.every((label) => NEUTRAL_TOKEN.test(label));

	const spot = {
		name,
		title,
		difficulty: keyOf(entry?.difficulty) || "",
		cities: asList(entry?.local).filter((city) => !ALL_TOKEN.test(city)),
		clans: everyClan ? [] : clanLabels.map((label) => ({ slug: keyOf(label), label })),
		everyClan,
		elements: neutral ? [] : elementLabels.filter((label) => !NEUTRAL_TOKEN.test(label)).map(keyOf),
		neutral,
	};

	const altName = cleanText(entry?.altName);
	if (altName) spot.altName = altName;
	const image = cleanText(entry?.imageUrl);
	if (image) spot.image = image;
	return spot;
}

// Returns every hunting spot the index widget knows about, or [] when the page is not the
// index (or the wiki moved the data again — the caller treats [] as "nothing to publish"
// rather than as an empty index).
export function extractHuntSpots(html) {
	const literal = extractJsLiteral(html, "hunts");
	if (!literal || typeof literal !== "object") return [];

	// Keyed by world ("NW"). Reading the values rather than the key list means a second
	// world needs no change here.
	const entries = Array.isArray(literal) ? literal : Object.values(literal).flat();
	const spots = entries.map(normalizeSpot).filter(Boolean);

	const seen = new Set();
	return spots.filter((spot) => {
		if (seen.has(spot.title)) return false;
		seen.add(spot.title);
		return true;
	});
}

// The same literal, shaped as the links discovery expects, so the 106 detail pages are
// crawled through the ordinary child-discovery path instead of a bespoke one.
export function huntEntriesAsLinks(html, baseUrl) {
	return extractHuntSpots(html).map((spot) => {
		const target = spot.title.replace(/\s+/g, "_");
		let url = "";
		try {
			url = new URL(`/index.php/${encodeURIComponent(target).replace(/%2F/g, "/")}`, baseUrl).toString();
		} catch {
			return null;
		}

		return {
			title: spot.title,
			label: spot.name,
			url,
			hasImage: Boolean(spot.image),
			headingPath: [],
		};
	}).filter(Boolean);
}

// --- detail pages ------------------------------------------------------------------

// The lead of every hunting-spot page states the three facts a player checks before going:
// difficulty, which resistance city it sits under, and which clans it suits. They are bold
// labels in a single <p>, not a table, so they never reach the generic section extractor.
const LEAD_LABELS = [
	["difficulty", /dificuldade/i],
	["resistance", /resist[êe]ncia/i],
	["clanText", /cl[ãa]s?\s+indicad/i],
];

function stripTags(value) {
	return cleanText(
		String(value ?? "")
			.replace(/<[^>]*>/g, " ")
			.replace(/&nbsp;/gi, " ")
			.replace(/&amp;/gi, "&")
			.replace(/&#39;/g, "'")
			.replace(/&quot;/g, '"')
	);
}

// A regex literal, not a constructed one: the pattern needs backslash classes and a
// template literal silently turns an unrecognized \s into a plain "s".
const LEAD_FACT_PATTERN = /<b>\s*([^<]*?)\s*<\/b>\s*:?\s*([\s\S]*?)(?=<br|<\/p>|<b>)/gi;

function readLeadFacts(articleHtml) {
	const lead = String(articleHtml ?? "").split(/<h2/i)[0] ?? "";
	const facts = {};

	LEAD_FACT_PATTERN.lastIndex = 0;
	let match;
	while ((match = LEAD_FACT_PATTERN.exec(lead)) !== null) {
		const label = match[1];
		const entry = LEAD_LABELS.find(([, pattern]) => pattern.test(label));
		if (!entry) continue;
		const value = stripTags(match[2]).replace(/\.\s*$/, "");
		if (value && !facts[entry[0]]) facts[entry[0]] = value;
	}

	return facts;
}

// "Elemento que causa dano super efetivo neste local" — the element to bring, which is the
// question a party answers. Distinct from the index's `huntTypes`, which is the damage the
// place deals to you.
function readWeakTo(articleHtml) {
	const source = String(articleHtml ?? "");
	const marker = /super\s*efetivo/i.exec(source);
	if (!marker) return [];

	const after = source.slice(marker.index, marker.index + 4000);
	const table = /<table[\s\S]*?<\/table>/i.exec(after);
	if (!table) return [];

	const elements = [];
	// Each row is an icon cell plus a bold name cell; the name is what survives tag stripping.
	for (const cell of table[0].match(/<td[\s\S]*?<\/td>/gi) ?? []) {
		const text = stripTags(cell);
		if (!text) continue;
		for (const token of text.split(/[,/|]/)) {
			const key = keyOf(token);
			if (key && !elements.includes(key)) elements.push(key);
		}
	}

	return elements;
}

// The boss and the Angry are why a spot is worth a trip — both are stated in prose bullets
// rather than any structured field.
function readNotableSpawns(articleHtml) {
	const source = String(articleHtml ?? "");
	const result = {};
	const patterns = [
		["boss", /<li>([\s\S]*?)<\/li>/gi, /é o\s+Boss/i],
		["angry", /<li>([\s\S]*?)<\/li>/gi, /Pok[ée]mon\s+Angry/i],
	];

	for (const [key, listPattern, sentence] of patterns) {
		listPattern.lastIndex = 0;
		let match;
		while ((match = listPattern.exec(source)) !== null) {
			const text = stripTags(match[1]);
			if (!sentence.test(text)) continue;
			// The name is the first bold run in the bullet.
			const bold = /<b>([\s\S]*?)<\/b>/i.exec(match[1]);
			const name = stripTags(bold?.[1] ?? "");
			if (name) result[key] = name;
			break;
		}
	}

	return result;
}

// Reads one hunting-spot page into the typed fields the overlay filters on. Returns null when
// the page carries none of them, so a mis-categorized page publishes no phantom hunt data.
export function extractHuntProfile(articleHtml) {
	const facts = readLeadFacts(articleHtml);
	const weakTo = readWeakTo(articleHtml);
	const spawns = readNotableSpawns(articleHtml);

	const clanLabels = (facts.clanText ?? "")
		.split(/[,;]| e /i)
		.map(cleanText)
		.filter(Boolean);
	const everyClan = clanLabels.some((label) => ALL_TOKEN.test(label));

	const cities = (facts.resistance ?? "")
		.split(/[,;]| e /i)
		.map(cleanText)
		.filter(Boolean);

	const profile = {
		difficulty: keyOf(facts.difficulty),
		cities,
		clans: everyClan ? [] : clanLabels.map((label) => ({ slug: keyOf(label), label })),
		everyClan,
		weakTo,
	};

	if (spawns.boss) profile.boss = spawns.boss;
	if (spawns.angry) profile.angry = spawns.angry;

	const hasContent = profile.difficulty || profile.cities.length || profile.clans.length
		|| profile.everyClan || weakTo.length;
	return hasContent ? profile : null;
}

// --- the Tasks section ---------------------------------------------------------------

// Every hunting-spot page carries a <tabber>, one panel per NPC, each holding a sentence and a
// reward wikitable. Flattened, that arrives as a paragraph list:
//
//   "# NPC Russel"
//   "A task do NPC Russel, que consiste em derrotar 55 Bagon…"
//   "Localização NPC Russel.png"
//   " | Recompensa"
//   "Exp icon.png | 1.826.000 de Experiencia"
//
// The generic task parser finds no task rows in that, and its fallback publishes one task whose
// objective is the section heading and whose notes are the raw lines — so the app rendered the
// "#" markers and the pipes as literal text. The shape is not a task list at all: it is two
// named panels, each with a description, a location screenshot and a reward table.

const HUNT_TASK_GROUP = /^#+\s*(.+)$/;
const HUNT_REWARD_HEADER = /^\|?\s*(?:recompensas?|rewards?)\s*$/i;
const MEDIA_FILE = /^(.*?)\.(?:png|gif|webp|jpe?g|svg)$/i;

function splitRewardRow(text) {
	const parts = String(text ?? "").split("|").map(cleanText);
	if (parts.length < 2) return null;

	// "Exp icon.png | 1.826.000 de Experiencia" — the icon names the reward, the rest is it.
	const label = parts.slice(1).filter(Boolean).join(" ");
	if (!label) return null;

	const icon = parts[0];
	return icon ? { icon, label } : { label };
}

// The NPC that hands the task out, named in the sentence itself on pages that have no tabber.
const HUNT_TASK_NPC = /\bNPC\s+([A-ZÀ-Ú][\wÀ-ú]*(?:\s+[A-ZÀ-Ú][\wÀ-ú]*)*)/;

/**
 * Reads a hunting-spot Tasks section into named panels with their rewards.
 *
 * Two shapes exist and both were mangled. Pages with a <tabber> flatten to "# NPC Russel"
 * headings with the reward rows in the prose; pages without one carry a single sentence and
 * put the reward rows in `items`. The generic task parser produced a fake task named after the
 * section for the first, and read the kill targets as loot for the second.
 */
export function extractHuntTasks(paragraphs = [], items = []) {
	const groups = [];
	const notes = [];
	let current = null;

	for (const raw of paragraphs ?? []) {
		const text = cleanText(raw);
		if (!text) continue;

		const heading = HUNT_TASK_GROUP.exec(text);
		if (heading) {
			current = { name: cleanText(heading[1]), description: [], rewards: [] };
			groups.push(current);
			continue;
		}

		// The reward table's own header row; the rows that follow say what it is.
		if (HUNT_REWARD_HEADER.test(text)) continue;

		const reward = current ? splitRewardRow(text) : null;
		if (reward) {
			current.rewards.push(reward);
			continue;
		}

		// A bare file name is the panel screenshot. It is already published as a media ref, so
		// keeping the name as prose would print the file name above the picture it names.
		if (MEDIA_FILE.test(text)) {
			if (current && !current.image) current.image = text;
			continue;
		}

		if (!current) {
			notes.push(text);
			continue;
		}

		// Prose after the panel's reward table is not part of the panel — the tabber has closed
		// and this is the section's own closing remarks.
		if (current.rewards.length) {
			notes.push(text);
			continue;
		}

		current.description.push(text);
	}

	const itemRewards = (items ?? []).map(splitRewardRow).filter(Boolean);

	// No tabber: one task, whose rewards came through `items` instead. The first sentence is
	// the objective and it names the NPC, which is a better label than the section heading the
	// old fallback used.
	if (!groups.length) {
		if (!notes.length && !itemRewards.length) return null;
		const name = HUNT_TASK_NPC.exec(notes[0] ?? "")?.[0] ?? "";
		if (!name && !itemRewards.length) return null;
		return {
			notes: notes.slice(1),
			groups: [{
				name: name || "Task",
				description: notes.slice(0, 1),
				rewards: itemRewards,
			}],
		};
	}

	// A tabber page can still list its rewards once, below the panels; they belong to the last.
	if (itemRewards.length && groups.length === 1) groups[0].rewards.push(...itemRewards);

	const kept = groups.filter((group) => group.name && (group.description.length || group.rewards.length));
	if (!kept.length) return null;
	return { notes, groups: kept };
}
// --- level gates ---------------------------------------------------------------------

// "Baixa" and "Alta" are the wiki's words for difficulty, and on their own they say low and
// high of nothing. What a player actually needs is the level the place is for, and the pages
// state it — two different ways, because the two difficulties gate differently.
//
//   alta:  "Jogadores abaixo do nível 400 não receberão experiência ou loot"  → a floor
//   baixa: "Após o nível 450, a experiência … diminuem … Ao atingir o nível 550, não será
//           mais possível receber experiência ou loot"                        → a ceiling
const LEVEL_FLOOR = /abaixo\s+do\s+n[ií]vel\s+(\d{2,4})/i;
const LEVEL_DECAY = /ap[óo]s\s+o\s+n[ií]vel\s+(\d{2,4})/i;
const LEVEL_CEILING = /ao\s+atingir\s+o\s+n[ií]vel\s+(\d{2,4})/i;

export function extractHuntLevels(lines = []) {
	const text = (lines ?? []).map((line) => String(line ?? "")).join(" ");
	const read = (pattern) => {
		const value = Number(pattern.exec(text)?.[1]);
		return Number.isFinite(value) ? value : null;
	};

	const levels = {};
	const floor = read(LEVEL_FLOOR);
	const decay = read(LEVEL_DECAY);
	const ceiling = read(LEVEL_CEILING);
	if (floor) levels.min = floor;
	if (decay) levels.decaysFrom = decay;
	if (ceiling) levels.max = ceiling;
	return Object.keys(levels).length ? levels : null;
}
