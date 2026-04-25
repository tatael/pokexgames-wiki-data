import { cleanStructuredText, stripImageRefFromText } from "./text.mjs";
import { parseSimpleRewardText } from "./rewards.mjs";

const RANK_HEADING_RE = /^#\s*(Rank\s+\d+\s+ao\s+\d+|Rank\s+\d+\s+to\s+\d+)/i;
const STAGE_RE = /Etapa\s+(\d+)\s*-\s*([\s\S]*?)(?=Etapa\s+\d+\s*-|Danger Room Team|Ap[oó]s concluir|Apos concluir|$)/gi;

function normalizeLine(value) {
	return String(value ?? "")
		.replace(/\s+/g, " ")
		.trim();
}

function splitSentences(value) {
	return String(value ?? "")
		.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/)
		.map((item) => cleanStructuredText(item))
		.filter(Boolean);
}

function parseCollectRows(text) {
	if (!/^Coletar\b/i.test(normalizeLine(text))) return [];
	const body = normalizeLine(text)
		.replace(/^Coletar\s+(?:Quantidade\s+Item\s+)?/i, "")
		.trim();
	const rows = [...body.matchAll(/(\d[\d.]*)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9'(). -]+?)(?=\s+\d[\d.]*\s+[A-ZÀ-Ý]|$)/g)]
		.map((match) => ({
			amount: match[1],
			item: cleanStructuredText(stripImageRefFromText(match[2])),
		}))
		.filter((row) => row.item);
	return rows;
}

function parseDefeatTargets(text) {
	if (!/^Derrotar\b/i.test(normalizeLine(text))) return [];
	const body = normalizeLine(text)
		.replace(/^Derrotar\s*(?:\(([^)]+)\))?/i, "")
		.replace(/\bDepois dessas etapas[\s\S]*$/i, "")
		.trim();
	const targets = [...body.matchAll(/(\d[\d.]*)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9'(). -]+?)(?=\s+\d[\d.]*\s+[A-ZÀ-Ý]|$)/g)]
		.map((match) => ({
			amount: match[1],
			name: cleanStructuredText(stripImageRefFromText(match[2])),
		}))
		.filter((target) => target.name);
	return targets;
}

function parseStage(number, rawText) {
	const text = normalizeLine(rawText);
	const captureMatch = text.match(/^Capturar\s+(.+)$/i);
	if (captureMatch) {
		const targetText = normalizeLine(captureMatch[1])
			.replace(/\bEm\s+\d{1,2}\/\d{1,2}\/\d{4}[\s\S]*$/i, "")
			.replace(/\bJogadores que[\s\S]*$/i, "")
			.trim();
		const targetName = cleanStructuredText(stripImageRefFromText(targetText)).replace(/[.;:,]$/, "").trim();
		return {
			number: Number(number),
			label: "Capturar",
			...(targetName ? { targets: [{ amount: "1", name: targetName }] } : {}),
			details: splitSentences(captureMatch[1]),
		};
	}

	const defeatLabel = text.match(/^Derrotar\s*(\([^)]+\))?/i)?.[1] ?? "";
	const defeatTargets = parseDefeatTargets(text);
	if (defeatTargets.length) {
		return {
			number: Number(number),
			label: cleanStructuredText(`Derrotar ${defeatLabel}`.trim()),
			targets: defeatTargets,
			details: splitSentences(text.replace(/^Derrotar\s*(?:\([^)]+\))?/i, "")),
		};
	}

	const collectRows = parseCollectRows(text);
	if (collectRows.length) {
		return {
			number: Number(number),
			label: "Coletar",
			rows: collectRows,
			details: [],
		};
	}

	return {
		number: Number(number),
		label: cleanStructuredText(text.split(/\s+/).slice(0, 4).join(" ")),
		details: splitSentences(text),
	};
}

function splitRewardText(value) {
	const rewardBody = normalizeLine(value).match(/receber[aá]\s+(.+)$/i)?.[1] ?? "";
	return rewardBody
		.split(/\s*,\s*|\s+e\s+/i)
		.map((item) => cleanStructuredText(item))
		.filter(Boolean);
}

function parseRankBody(body) {
	const text = normalizeLine(body);
	const introText = text.split(/Etapa\s+1\s*-/i)[0] ?? "";
	const stages = [...text.matchAll(STAGE_RE)].map((match) => parseStage(match[1], match[2]));
	const dangerRoomTeamText = normalizeLine(text.match(/Danger Room Team\s+([\s\S]*?)(?=Ap[oóàa]?s concluir|Apos concluir|$)/i)?.[1] ?? "");
	const rewardText = normalizeLine(text.match(/(Ap[oóàa]?s concluir[\s\S]*)$/i)?.[1] ?? "");

	return {
		intro: splitSentences(introText),
		stages,
		dangerRoomTeamText,
		rewardText,
		rewardItems: splitRewardText(rewardText),
		rewards: rewardText ? parseSimpleRewardText(rewardText) : [],
	};
}

export function parseClanTaskRanks(paragraphs = [], items = []) {
	const lines = [...paragraphs, ...items].map(normalizeLine).filter(Boolean);
	const ranks = [];
	let current = null;

	for (const line of lines) {
		const headingMatch = line.match(RANK_HEADING_RE);
		if (headingMatch) {
			if (current) ranks.push(current);
			current = { title: cleanStructuredText(headingMatch[1]), body: [] };
			continue;
		}

		if (!current) {
			current = { title: "Tasks", body: [] };
		}

		current.body.push(line);
	}

	if (current) ranks.push(current);

	return ranks
		.map((rank) => ({
			title: rank.title,
			...parseRankBody(rank.body.join(" ")),
		}))
		.filter((rank) => rank.intro.length || rank.stages.length || rank.dangerRoomTeamText || rank.rewardText);
}
