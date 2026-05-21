import { PT_BR, buildSlug } from "./shared.mjs";

const ACTION_TYPE_MAP = new Map([
	["defeat", "defeat"],
	["kill", "defeat"],
	["multiple_kills", "defeat"],
	["capture", "capture"],
	["catch", "capture"],
	["deliver", "deliver"],
	["drop", "deliver"],
	["collect", "collect"],
	["trade", "trade"],
	["find", "find"],
	["pickup", "pickup"],
	["return", "return"],
	["duel", "duel"],
	["talk", "talk"],
	["dex", "pokedex"],
	["pokédex", "pokedex"],
	["pokedex", "pokedex"],
	["other", "step"],
]);

const VERB_LABEL = new Map([
	["defeat", "Derrotar"],
	["capture", "Capturar"],
	["deliver", "Entregar"],
	["collect", "Coletar"],
	["trade", "Trocar"],
	["find", "Encontrar"],
	["pickup", "Pegar"],
	["return", "Devolver"],
	["duel", "Duelar"],
	["talk", "Conversar"],
	["pokedex", "Registrar na Pokédex"],
	["step", "Realizar"],
]);

const PRIMARY_TYPE_PRIORITY = ["deliver", "collect", "trade", "pokedex", "capture", "find", "pickup", "return", "duel", "defeat", "talk", "step"];

const SLUG_REGION_OVERRIDES = new Map([
	["tasks", "Kanto"],
	["johto-tasks", "Johto"],
	["nightmare-tasks", "Nightmare"],
]);

export function isFlexTasksPage(html, pageContext = {}) {
	if (pageContext?.category !== "tasks") return false;
	return /window\.quests\.[A-Za-z0-9_]+\s*=\s*\[/.test(String(html ?? ""));
}

export function extractFlexTasksData(html) {
	const source = String(html ?? "");
	const startRe = /window\.quests\.[A-Za-z0-9_]+\s*=\s*\[/g;
	const all = [];
	let match;
	while ((match = startRe.exec(source))) {
		const startIdx = match.index + match[0].length - 1;
		const slice = sliceBalancedArray(source, startIdx);
		if (!slice) continue;
		try {
			all.push(...JSON.parse(stripTrailingCommas(slice)));
		} catch {
			// ignore unparseable block
		}
	}

	return all;
}

function sliceBalancedArray(source, startIdx) {
	let depth = 0;
	let inStr = false;
	let esc = false;
	for (let i = startIdx; i < source.length; i += 1) {
		const ch = source[i];
		if (inStr) {
			if (esc) { esc = false; continue; }
			if (ch === "\\") { esc = true; continue; }
			if (ch === "\"") inStr = false;
			continue;
		}

		if (ch === "\"") inStr = true;
		else if (ch === "[") depth += 1;
		else if (ch === "]") {
			depth -= 1;
			if (depth === 0) return source.slice(startIdx, i + 1);
		}
	}

	return null;
}

function stripTrailingCommas(json) {
	return json.replace(/,(\s*[}\]])/g, "$1");
}

export function buildFlexTaskSections(rawTasks, pageContext = {}) {
	const slug = pageContext?.slug ?? "";
	const pageRegion = SLUG_REGION_OVERRIDES.get(slug) ?? null;
	const filtered = pageRegion
		? rawTasks.filter((task) => normalize(task?.region) === normalize(pageRegion))
		: rawTasks;

	const byCity = new Map();
	for (const task of filtered) {
		const city = cleanText(task?.location?.city) || "Outros";
		if (!byCity.has(city)) byCity.set(city, []);
		byCity.get(city).push(task);
	}

	const sections = [];
	for (const [city, tasks] of byCity) {
		const taskRows = tasks.map(buildTaskRow).filter(Boolean);
		if (!taskRows.length) continue;
		const cityId = buildSlug(`${pageRegion ?? "tasks"} ${city}`, "tasks-city");
		sections.push({
			id: cityId,
			heading: { [PT_BR]: city },
			paragraphs: { [PT_BR]: [] },
			items: { [PT_BR]: [] },
			media: { [PT_BR]: [] },
			tasks: { [PT_BR]: taskRows },
			kind: "tasks",
			_flexTasks: true,
		});
	}

	return sections;
}

function buildTaskRow(raw) {
	const name = cleanNpcName(raw?.name);
	if (!name) return null;
	const steps = Array.isArray(raw?.steps) ? raw.steps : [];

	const primaryType = pickPrimaryStepType(steps);
	const targets = collectTargets(steps);
	const objectiveText = buildObjectiveText(primaryType, targets);
	const objectiveDetails = {
		type: primaryType,
		text: objectiveText,
		...(targets.length ? { targets } : {}),
	};

	const rewards = aggregateRewards(steps);
	const notes = buildNotes(raw, steps);
	const requirements = parseRequirements(raw?.requirements);
	const portrait = cleanText(raw?.image);
	const stepRows = buildStepRows(steps);

	return {
		title: name,
		npc: name,
		objective: name,
		objectiveDetails,
		requirements,
		rewards,
		notes,
		targets,
		...(portrait ? { portrait } : {}),
		...(stepRows.length ? { steps: stepRows } : {}),
	};
}

function buildStepRows(steps) {
	const out = [];
	for (const step of steps ?? []) {
		const stepType = ACTION_TYPE_MAP.get(normalize(step?.type)) ?? "step";
		const label = VERB_LABEL.get(stepType) ?? cleanText(step?.action) ?? "";
		const targets = [];
		for (const target of step?.targets ?? []) {
			const name = cleanText(target?.name);
			if (!name) continue;
			const cleanedName = name.replace(/^falar com\s+/i, "");
			targets.push({
				name: cleanedName,
				slug: buildSlug(cleanedName, ""),
				amount: Number(target?.quantity ?? 1) || 1,
				...(target?.kind ? { kind: String(target.kind) } : {}),
				...(target?.image ? { image: String(target.image) } : {}),
			});
		}

		const rewards = [];
		const reward = step?.reward;
		if (reward) {
			if (Number.isFinite(reward.xp) && reward.xp > 0) {
				rewards.push({ type: "loot", name: "Experiência", qty: String(reward.xp), icon: "xp" });
			}
			if (Number.isFinite(reward.nwXp) && reward.nwXp > 0) {
				rewards.push({ type: "loot", name: "Experiência Nightmare", qty: String(reward.nwXp), icon: "nightmare-xp" });
			}
			for (const item of reward.items ?? []) {
				const itemName = cleanText(item?.item);
				if (!itemName) continue;
				rewards.push({
					type: "loot",
					name: itemName,
					qty: String(Number(item?.quantity ?? 1) || 1),
					...(item?.image ? { image: String(item.image) } : {}),
				});
			}
		}

		out.push({
			type: stepType,
			label,
			...(targets.length ? { targets } : {}),
			...(rewards.length ? { rewards } : {}),
		});
	}

	return out;
}

function cleanNpcName(value) {
	return cleanText(value).replace(/\s*\d{1,4}$/, "").trim();
}

function parseRequirements(raw) {
	if (!raw || typeof raw !== "object") return {};
	const out = {};
	const level = Number(raw.level);
	const nwLevel = Number(raw.nightmareLevel ?? raw.nwLevel);
	if (Number.isFinite(level) && level > 0) out.level = level;
	if (Number.isFinite(nwLevel) && nwLevel > 0) out.nightmareLevel = nwLevel;
	return out;
}

function pickPrimaryStepType(steps) {
	const types = steps.map((step) => ACTION_TYPE_MAP.get(normalize(step?.type)) ?? "step");
	for (const priority of PRIMARY_TYPE_PRIORITY) {
		if (types.includes(priority)) return priority;
	}

	return types[0] ?? "step";
}

function collectTargets(steps) {
	const seen = new Map();
	const out = [];
	for (const step of steps) {
		const stepType = ACTION_TYPE_MAP.get(normalize(step?.type)) ?? "step";
		if (stepType === "talk") continue;
		for (const target of step?.targets ?? []) {
			const name = cleanText(target?.name);
			if (!name) continue;
			const slug = buildSlug(name, "");
			const key = slug || name.toLowerCase();
			if (seen.has(key)) {
				const existing = seen.get(key);
				const incoming = Number(target?.quantity ?? 1) || 1;
				if (incoming > existing.amount) existing.amount = incoming;
				continue;
			}
			const entry = {
				name,
				slug,
				amount: Number(target?.quantity ?? 1) || 1,
				...(target?.kind ? { kind: String(target.kind) } : {}),
				...(target?.image ? { image: String(target.image) } : {}),
			};
			seen.set(key, entry);
			out.push(entry);
		}
	}

	return out;
}

function buildObjectiveText(primaryType, targets) {
	const verb = VERB_LABEL.get(primaryType) ?? "";
	const targetText = targets
		.map((t) => (t.amount && t.amount > 1 ? `${t.amount} ${t.name}` : t.name))
		.join(", ");
	if (verb && targetText) return `${verb}: ${targetText}`;
	return verb;
}

function aggregateRewards(steps) {
	const out = [];
	const seenLoot = new Map();

	let xpTotal = 0;
	let nwXpTotal = 0;
	let cashTotal = 0;

	for (const step of steps) {
		const reward = step?.reward;
		if (!reward) continue;
		if (Number.isFinite(reward.xp)) xpTotal += Number(reward.xp);
		if (Number.isFinite(reward.nwXp)) nwXpTotal += Number(reward.nwXp);

		for (const item of reward.items ?? []) {
			const itemName = cleanText(item?.item);
			if (!itemName) continue;
			const qty = Number(item?.quantity ?? 1) || 1;
			if (/^cash$/i.test(itemName) || /^dinheiro$/i.test(itemName)) {
				cashTotal += qty;
				continue;
			}

			const key = normalize(itemName);
			if (seenLoot.has(key)) {
				seenLoot.get(key).qty = String(Number(seenLoot.get(key).qty || 0) + qty);
				continue;
			}

			const entry = {
				type: "loot",
				name: itemName,
				qty: String(qty),
				...(item?.image ? { image: String(item.image) } : {}),
			};
			seenLoot.set(key, entry);
			out.push(entry);
		}
	}

	if (xpTotal > 0) out.unshift({ type: "loot", name: "Experiência", qty: String(xpTotal), icon: "xp" });
	if (nwXpTotal > 0) out.unshift({ type: "loot", name: "Experiência Nightmare", qty: String(nwXpTotal), icon: "nightmare-xp" });
	if (cashTotal > 0) out.push({ type: "loot", name: "Cash", qty: String(cashTotal) });

	return out;
}

function buildNotes(raw, steps) {
	const notes = [];
	const coords = cleanText(raw?.location?.coordinates);
	if (coords) notes.push(`Localização: ${coords}`);
	const extras = cleanText(raw?.extras);
	if (extras) notes.push(extras);

	const stepDescriptions = [];
	for (const step of steps) {
		const stepType = ACTION_TYPE_MAP.get(normalize(step?.type)) ?? "step";
		if (stepType !== "talk") continue;
		const npc = step?.targets
			?.map((t) => cleanText(t?.name).replace(/^falar com\s+/i, ""))
			.filter(Boolean)
			.join(", ");
		if (npc) stepDescriptions.push(`Conversar com ${npc}`);
	}

	if (stepDescriptions.length) notes.push(stepDescriptions.join("; "));
	return notes;
}

function cleanText(value) {
	return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
	return cleanText(value).toLowerCase();
}
