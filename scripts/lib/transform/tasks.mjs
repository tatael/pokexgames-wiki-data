import { buildSlug } from "../shared.mjs";
import { cleanStructuredText, normalizeIdToken, stripImageRefFromText } from "./text.mjs";
import { parseSimpleRewardText } from "./rewards.mjs";

const TASK_START_RE = /^(?:\d+[\u00ba\u00aa\u00b0]?[.)]?\s*)?(derrotar|coletar|entregar|capturar|trocar|encontrar|pegar|devolver|duelar|parte\s+\d+)/i;
const TASK_LEVEL_RE = /\b(?:level|lvl|nw level|level minimo|level m\u00ednimo)\b/i;
const TASK_REWARD_RE = /(?:(?:exp icon nw|exp icon)\s+[\d.]+|\d[\d.]*\s+(?:xp|experience|nightmare|cyan|black|gem|ball|token)|\$\s*[\d.]+|^\d[\d.]*\s+\d)/i;

function looksLikeTaskStartText(value) {
	return TASK_START_RE.test(String(value ?? "").trim());
}

function looksLikeTaskRewardText(value) {
	return TASK_REWARD_RE.test(String(value ?? "").trim());
}

function cleanTaskObjectiveText(value) {
	return cleanStructuredText(value)
		.replace(/\b(\d+x?\s+)?\d{3,4}\s*[-_.]\s*([A-Za-z][A-Za-z' .-]+?)\s+\2\b/gi, "$1$2")
		.replace(/\b(\d+x?\s+)?[\p{L}\p{N}_%()' .-]+\.(?:png|gif|webp|jpe?g)\s+([\p{L}][\p{L}' .-]+)/giu, "$1$2")
		.replace(/\s+(?:Task\s+)?[A-Z][\p{L}\p{N}_%()'-]*(?:\s+[A-Z][\p{L}\p{N}_%()'-]*){0,3}\.(?:png|gif|webp|jpe?g)\b/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function cleanTaskTargetText(value) {
	const text = cleanTaskObjectiveText(value);
	const spriteMatch = text.match(/^(?:\d{1,4}[-_.]\s*)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]+?)(?:\s+\1)?$/i);
	return cleanStructuredText(spriteMatch?.[1] ?? text).trim();
}

function parseTaskRowsFromLines(lines = []) {
	const tasks = [];
	let current = null;
	const pushCurrent = () => {
		if (current?.objective) {
			const requirementsText = current.requirementsText ?? current.requirements ?? [];
			delete current.requirementsText;
			tasks.push({
				...current,
				objectiveDetails: current.objectiveDetails ?? parseTaskObjectiveDetails(current.objective),
				requirements: parseTaskRequirements(requirementsText),
			});
		}
		current = null;
	};

	for (const rawLine of lines) {
		const line = cleanStructuredText(rawLine);

		if (!line || /^#|^-{3,}$/.test(line) || normalizeIdToken(line) === "indice") continue;

		const inlineTask = parseTaskLineText(line);
		if (inlineTask) {
			pushCurrent();
			tasks.push(inlineTask);
			continue;
		}

		if (looksLikeTaskStartText(line)) {
			pushCurrent();
			current = { objective: line, requirementsText: [], rewards: [], notes: [], targets: [] };
			continue;
		}

		if (!current) current = { objective: "", requirementsText: [], rewards: [], notes: [], targets: [] };

		if (TASK_LEVEL_RE.test(line)) current.requirementsText.push(line);
		else if (looksLikeTaskRewardText(line)) current.rewards.push(...parseSimpleRewardText(line));
		else current.notes.push(line);
	}

	pushCurrent();

	return tasks;
}

function splitTaskRewardSuffix(value) {
	const text = String(value ?? "").trim();
	const rewardMatch = text.match(/\s((?:\$\s*[\d.]+|(?:Exp icon nw|Exp icon)\s+[\d.]+(?:\s+Exp icon nw\s+[\d.]+)?|\d[\d.]*\s*(?:Exp icon nw|Exp icon|EXP|XP|Experience|Nightmare Experience|Black Nightmare Gem|Cyan Nightmare Gem|Nightmare Ball|Beast Ball|Token|Tokens?)(?:\b.*)?))$/i);
	if (!rewardMatch) return { objectiveText: text, rewardText: "" };
	return {
		objectiveText: text.slice(0, rewardMatch.index).trim(),
		rewardText: rewardMatch[1].trim(),
	};
}

function splitObjectiveNoteText(value, objectiveDetails) {
	const text = cleanStructuredText(cleanTaskObjectiveText(value));
	const body = cleanStructuredText(objectiveDetails?.text ?? "");
	if (!text || !body) return { objective: text, note: "" };
	const noteMatch = body.match(/^(.+?)\s+((?:que|which)\b.+)$/i);
	if (!noteMatch) return { objective: text, note: "" };
	const objectiveBody = cleanStructuredText(noteMatch[1]);
	const note = cleanStructuredText(noteMatch[2]);
	return {
		objective: text.replace(body, objectiveBody).trim(),
		note,
	};
}

function parseTaskLineText(value) {
	const text = cleanStructuredText(value);
	const match = text.match(/^(?:(\d+)[.)]?\s*)?(NPC\s+.+?)\s+(Derrotar|Coletar|Entregar|Capturar|Trocar|Encontrar|Pegar|Devolver|Duelar)\s*:?\s*(.+)$/i);
	if (!match) return null;
	const [, rawIndex, rawTitle, rawVerb, body] = match;
	const { objectiveText, rewardText } = splitTaskRewardSuffix(body);
	const initialObjective = cleanTaskObjectiveText(`${rawVerb}: ${objectiveText}`);
	const initialDetails = parseTaskObjectiveDetails(initialObjective);
	const splitObjective = splitObjectiveNoteText(initialObjective, initialDetails);
	const objective = splitObjective.objective;
	const objectiveDetails = parseTaskObjectiveDetails(objective);
	const taskIndex = Number.parseInt(rawIndex ?? "", 10);
	const title = cleanStructuredText(rawTitle);
	const noteText = cleanStructuredText(splitObjective.note || cleanTaskObjectiveText(objectiveText)
		.replace(new RegExp(`^${objectiveDetails.text?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? ""}\\s*`, "i"), "")
		.trim());
	return {
		...(Number.isFinite(taskIndex) ? { index: taskIndex } : {}),
		title,
		npc: title.replace(/^NPC\s+/i, "").trim() || title,
		objective,
		objectiveDetails,
		requirements: {},
		rewards: rewardText ? parseSimpleRewardText(rewardText) : [],
		notes: noteText ? [noteText] : [],
		targets: objectiveDetails.targets ?? [],
	};
}

function parseTaskRowsFromPipeItems(items = []) {
	return items.map((rawItem) => {
		const rawCells = String(rawItem ?? "")
			.split(/\s*\|\s*/)
			.map((cell) => cleanStructuredText(cell))
			.filter(Boolean);

		const cells = rawCells.map((cell) => cleanStructuredText(stripImageRefFromText(cell)) || cell);

		if (cells.length < 3) return null;

		const taskIndex = Number.parseInt(rawCells[0].match(/^(\d+)[.)]?\s+/)?.[1] ?? "", 10);
		const title = rawCells[0].replace(/^\d+[.)]?\s*/, "").trim();
		const objectiveSource = rawCells.find(looksLikeTaskStartText) ?? "";
		const initialObjective = cleanTaskObjectiveText(objectiveSource);
		const initialDetails = parseTaskObjectiveDetails(initialObjective);
		const splitObjective = splitObjectiveNoteText(initialObjective, initialDetails);
		const objective = splitObjective.objective;

		if (!objective) return null;

		const requirements = rawCells.filter((cell) => TASK_LEVEL_RE.test(cell));
		const rewardCell = rawCells.find((cell) => looksLikeTaskRewardText(cell));
		const skipTokens = new Set([title, objective, rewardCell, ...requirements].map(normalizeIdToken));
		const notes = [
			splitObjective.note,
			...rawCells.map((cell) => cleanStructuredText(stripImageRefFromText(cell)) || cell).filter((cell, index) =>
				index !== 0
				&& normalizeIdToken(rawCells[index]) !== normalizeIdToken(objectiveSource)
				&& !skipTokens.has(normalizeIdToken(cell))
				&& !skipTokens.has(normalizeIdToken(rawCells[index]))
				&& !looksLikeTaskStartText(rawCells[index])
				&& !TASK_LEVEL_RE.test(rawCells[index])
				&& !looksLikeTaskRewardText(rawCells[index])
			),
		].filter(Boolean);

		const objectiveDetails = parseTaskObjectiveDetails(objective);
		return {
			...(Number.isFinite(taskIndex) ? { index: taskIndex } : {}),
			title,
			npc: title.replace(/^NPC\s+/i, "").trim() || title,
			objective,
			objectiveDetails,
			requirements: parseTaskRequirements(requirements),
			rewards: rewardCell ? parseSimpleRewardText(rewardCell) : [],
			notes,
			targets: objectiveDetails.targets ?? [],
		};
	}).filter(Boolean);
}

export function parseTaskRows(paragraphs = [], items = []) {
	const pipeTasks = parseTaskRowsFromPipeItems(items);

	if (pipeTasks.length === items.length && pipeTasks.length) return pipeTasks;
	if (pipeTasks.length) {
		const parsedByItem = items
			.map((item) => parseTaskRowsFromPipeItems([item])[0] ?? parseTaskLineText(item))
			.filter(Boolean);
		if (parsedByItem.length) return parsedByItem;
	}

	return parseTaskRowsFromLines([...paragraphs, ...items]);
}

function parseTaskRequirements(values = []) {
	const text = values.join(" ");
	const level = text.match(/\bLevel(?:\s+M[ií]nimo)?\s*:?\s*(\d+)/i)?.[1] ?? null;
	const nightmareLevel = text.match(/\bNW\s+Level\s*:?\s*(\d+)/i)?.[1] ?? null;
	return {
		...(level ? { level: Number(level) } : {}),
		...(nightmareLevel ? { nightmareLevel: Number(nightmareLevel) } : {}),
	};
}

export function parseTaskObjectiveDetails(value) {
	const text = cleanTaskObjectiveText(value);
	const match = text.match(/^(Derrotar|Coletar|Entregar|Capturar|Trocar|Encontrar|Pegar|Devolver|Duelar|Parte\s+\d+)\s*:?\s*(.+)$/i);
	if (!match) return { type: "text", text };
	const verb = normalizeIdToken(match[1]);
	const body = cleanStructuredText(match[2]);
	if (verb === "derrotar" || verb === "capturar") {
		const targets = body
			.split(/\s*(?:,| e | ou | and | or )\s*/i)
			.map((part) => {
				const targetMatch = cleanTaskObjectiveText(part).match(/^(?:(\d+)x?\s+)?(.+)$/i);
				if (!targetMatch?.[2]) return null;
				const name = cleanTaskObjectiveText(targetMatch[2]).replace(/[|.]+$/, "").trim();
				if (!name) return null;
				return {
					name,
					slug: buildSlug(name, ""),
					amount: Number(targetMatch[1] ?? 1),
				};
			})
			.filter(Boolean);
		return { type: verb === "capturar" ? "capture" : "defeat", text: body, targets };
	}

	if (verb === "coletar") return { type: "collect", text: body };
	if (verb === "entregar") return { type: "deliver", text: body };
	if (verb === "trocar") return { type: "trade", text: body };
	if (verb === "encontrar") return { type: "find", text: body };
	if (verb === "pegar") return { type: "pickup", text: body };
	if (verb === "devolver") return { type: "return", text: body };
	if (verb === "duelar") return { type: "duel", text: body };
	return { type: "step", text: body };
}

export function parseTaskGroups(paragraphs = [], items = [], fallbackTitle = "") {
	const intro = paragraphs.filter(isTaskIntroText);
	const groups = [];
	const groupsByIndex = new Map();
	let current = null;
	const openGroup = (name, index = null) => {
		current = { name, tasks: [] };
		groups.push(current);
		if (index !== null) groupsByIndex.set(index, current);
	};

	for (const rawItem of items) {
		const text = cleanStructuredText(rawItem);
		if (!text) continue;
		const task = parseTaskRowsFromPipeItems([text])[0] ?? parseTaskLineText(text);
		if (task) {
			const targetGroup = Number.isFinite(task.index) ? groupsByIndex.get(task.index) : null;
			if (targetGroup) {
				targetGroup.tasks.push(task);
			} else {
				if (!current || (groupsByIndex.size && !current.tasks.length)) openGroup(fallbackTitle || "Tasks");
				current.tasks.push(task);
			}
			continue;
		}

		const groupMatch = text.match(/^\d+[.)]?\s+(.+)$/);
		if (groupMatch && !text.includes("|")) {
			const groupIndex = Number.parseInt(text.match(/^(\d+)/)?.[1] ?? "", 10);
			openGroup(cleanStructuredText(groupMatch[1]), Number.isFinite(groupIndex) ? groupIndex : null);
			continue;
		}

		if (!current && isTaskIntroText(text)) intro.push(text);
	}

	return {
		intro,
		groups: groups.filter((group) => group.tasks.length),
	};
}

export function parseTaskSectionPayloads(section) {
	const tasks = {};
	const taskGroups = {};
	for (const locale of new Set([
		...Object.keys(section.paragraphs ?? {}),
		...Object.keys(section.items ?? {})
	])) {
		const paragraphs = section.paragraphs?.[locale] ?? [];
		const items = section.items?.[locale] ?? [];
		const parsed = parseTaskRows(paragraphs, items);
		const fallbackTitle = section.heading?.[locale] ?? section.heading?.["pt-BR"] ?? "";
		const grouped = parseTaskGroups(paragraphs, items, fallbackTitle);

		if (parsed.length) {
			tasks[locale] = parsed;
		} else {
			const rewards = paragraphs.length ? parseSimpleRewardText(paragraphs[0]) : [];
			const targets = items
				.flatMap((item) => String(item ?? "").split(/\s*\|\s*/))
				.map(cleanTaskTargetText)
				.filter(Boolean);
			tasks[locale] = [{
				objective: fallbackTitle,
				objectiveDetails: parseTaskObjectiveDetails(fallbackTitle),
				requirements: {},
				rewards,
				notes: paragraphs.slice(rewards.length ? 1 : 0),
				targets
			}].filter((task) => task.objective || task.rewards.length || task.notes.length || task.targets.length);
		}

		if (grouped.groups.length || grouped.intro.length) {
			taskGroups[locale] = grouped;
		}
	}

	return {
		...(Object.keys(tasks).length ? { tasks } : {}),
		...(Object.keys(taskGroups).length ? { taskGroups } : {}),
	};
}

function isTaskIntroText(value) {
	const text = cleanStructuredText(value);
	if (!text || text.startsWith("#")) return false;
	if (looksLikeTaskStartText(text)) return false;
	if (TASK_LEVEL_RE.test(text)) return false;
	if (looksLikeTaskRewardText(text)) return false;
	return true;
}
