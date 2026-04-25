import { buildSlug } from "../shared.mjs";
import { cleanStructuredText, normalizeIdToken, stripImageRefFromText } from "./text.mjs";
import { parseSimpleRewardText } from "./rewards.mjs";

const TASK_START_RE = /^(?:\d+[\u00ba\u00aa\u00b0]?\s*)?(derrotar|coletar|entregar|parte\s+\d+)/i;
const TASK_LEVEL_RE = /\b(?:level|lvl|nw level|level minimo|level m\u00ednimo)\b/i;
const TASK_REWARD_RE = /(?:\d[\d.]*\s+(?:xp|experience|nightmare|cyan|black|gem|ball|token)|\$\s*[\d.]+|^\d[\d.]*\s+\d)/i;

function looksLikeTaskStartText(value) {
	return TASK_START_RE.test(String(value ?? "").trim());
}

function looksLikeTaskRewardText(value) {
	return TASK_REWARD_RE.test(String(value ?? "").trim());
}

function cleanTaskObjectiveText(value) {
	return cleanStructuredText(value)
		.replace(/\b(\d+x?\s+)?\d{3,4}\s*[-_.]\s*([A-Za-z][A-Za-z' .-]+?)\s+\2\b/gi, "$1$2")
		.replace(/\b(\d+x?\s+)?[A-Za-z0-9%()' -]+\.(?:png|gif|webp|jpe?g)\s+([A-Za-z][A-Za-z' .-]+)/gi, "$1$2")
		.replace(/\s+/g, " ")
		.trim();
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

function parseTaskRowsFromPipeItems(items = []) {
	return items.map((rawItem) => {
		const rawCells = String(rawItem ?? "")
			.split(/\s*\|\s*/)
			.map((cell) => cleanStructuredText(cell))
			.filter(Boolean);

		const cells = rawCells.map((cell) => cleanStructuredText(stripImageRefFromText(cell)) || cell);

		if (cells.length < 3) return null;

		const taskIndex = Number.parseInt(cells[0].match(/^(\d+)[.)]?\s+/)?.[1] ?? "", 10);
		const title = cells[0].replace(/^\d+\.\s*/, "").trim();
		const objective = cleanTaskObjectiveText(cells.find(looksLikeTaskStartText) ?? "");

		if (!objective) return null;

		const requirements = rawCells.filter((cell) => TASK_LEVEL_RE.test(cell));
		const rewardCell = rawCells.find((cell) => /exp icon|nightmare gem|beast ball|nightmare ball|cyan/i.test(cell) && looksLikeTaskRewardText(cell));
		const skipTokens = new Set([title, objective, rewardCell, ...requirements].map(normalizeIdToken));
		const notes = cells.filter((cell) =>
			!skipTokens.has(normalizeIdToken(cell))
			&& normalizeIdToken(cell) !== normalizeIdToken(cells[0])
			&& !looksLikeTaskStartText(cell)
			&& !TASK_LEVEL_RE.test(cell)
			&& !looksLikeTaskRewardText(cell)
		);

		return {
			...(Number.isFinite(taskIndex) ? { index: taskIndex } : {}),
			title,
			npc: title.replace(/^NPC\s+/i, "").trim() || title,
			objective,
			objectiveDetails: parseTaskObjectiveDetails(objective),
			requirements: parseTaskRequirements(requirements),
			rewards: rewardCell ? parseSimpleRewardText(rewardCell) : [],
			notes,
			targets: [objective],
		};
	}).filter(Boolean);
}

export function parseTaskRows(paragraphs = [], items = []) {
	const pipeTasks = parseTaskRowsFromPipeItems(items);

	if (pipeTasks.length) return pipeTasks;

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
	const match = text.match(/^(Derrotar|Coletar|Entregar|Parte\s+\d+)\s*:?\s*(.+)$/i);
	if (!match) return { type: "text", text };
	const verb = normalizeIdToken(match[1]);
	const body = cleanStructuredText(match[2]);
	if (verb === "derrotar") {
		const targets = body
			.split(/\s*(?:,| e | ou | and | or )\s*/i)
			.map((part) => {
				const targetMatch = cleanTaskObjectiveText(part).match(/^(\d+)x?\s+(.+)$/i);
				if (!targetMatch) return null;
				const name = cleanTaskObjectiveText(targetMatch[2]).replace(/\.$/, "");
				return {
					name,
					slug: buildSlug(name, ""),
					amount: Number(targetMatch[1]),
				};
			})
			.filter(Boolean);
		return { type: "defeat", text: body, targets };
	}

	if (verb === "coletar") return { type: "collect", text: body };
	if (verb === "entregar") return { type: "deliver", text: body };
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
		const task = parseTaskRowsFromPipeItems([text])[0];
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
				.map((item) => stripImageRefFromText(item.trim()))
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
