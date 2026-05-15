import { cleanStructuredText, stripImageRefFromText } from "./text.mjs";
import { parseSimpleRewardText } from "./rewards.mjs";

const RANK_HEADING_RE = /^#\s*(Rank\s+\d+\s+ao\s+\d+|Rank\s+\d+\s+to\s+\d+)/i;
const STAGE_RE = /Etapa\s+(\d+)\s*-\s*([\s\S]*?)(?=Etapa\s+\d+\s*-|Danger Room Team|Ap\S*s concluir|Apos concluir|$)/giu;

function normalizeLine(value) {
	return String(value ?? "")
		.replace(/\s+/g, " ")
		.trim();
}

function splitSentences(value) {
	return String(value ?? "")
		.split(/(?<=[.!?])\s+(?=[\p{Lu}0-9])/u)
		.map((item) => cleanStructuredText(item))
		.filter(Boolean);
}

function stripInlineImageArtifacts(value) {
	return cleanStructuredText(String(value ?? "")
		.replace(/\b([\p{L}\p{N}_%().' -]+?)\.(?:gif|png|jpe?g|webp|svg)\b\s+\1\b/giu, "$1")
		.replace(/\s+\d{1,4}[-_.][^\s]+?\.(?:gif|png|jpe?g|webp|svg)\b/giu, " ")
		.replace(/^\d{1,4}[-_.][^\s]+?\.(?:gif|png|jpe?g|webp|svg)\b\s*/iu, " "));
}

function stripLeadingImageReference(value) {
	return String(value ?? "").replace(/^[\p{L}\p{N}_%().' -]+?\.(?:gif|png|jpe?g|webp|svg)\b\s+/iu, "");
}

function cleanTaskEntityName(value) {
	return cleanStructuredText(stripImageRefFromText(stripLeadingImageReference(stripInlineImageArtifacts(value))))
		.replace(/^\d{1,4}[-_.\s]+(?=\p{Lu})/u, "")
		.replace(/[.;:,]$/, "")
		.trim();
}

function splitTaskDetails(value) {
	return splitSentences(stripInlineImageArtifacts(value)
		.replace(/\b\d{1,4}[-_.\s]+([\p{Lu}][\p{L}0-9'(). -]*?)(?=\s|$|[.,;:])/gu, "$1"));
}

function parseCollectRows(text) {
	if (!/^Coletar\b/i.test(normalizeLine(text))) return [];
	const body = stripInlineImageArtifacts(normalizeLine(text)
		.replace(/^Coletar\s+(?:Quantidade\s+Item\s+)?/i, "")
		.trim());
	const rows = [...body.matchAll(/(\d[\d.]*)\s+(\p{Lu}[\p{L}0-9'(). -]+?)(?=\s+\d[\d.]*\s+\p{Lu}|$)/gu)]
		.map((match) => ({
			amount: match[1],
			item: cleanTaskEntityName(match[2]),
		}))
		.filter((row) => row.item);
	return rows;
}

function parseDefeatTargets(text) {
	if (!/^Derrotar\b/i.test(normalizeLine(text))) return [];
	const body = stripInlineImageArtifacts(normalizeLine(text)
		.replace(/^Derrotar\s*(?:\(([^)]+)\))?/i, "")
		.replace(/\bDepois dessas etapas[\s\S]*$/i, "")
		.trim());
	const targets = [...body.matchAll(/(\d[\d.]*)\s+(?:\d{1,4}[-_.\s]+)?(\p{Lu}[\p{L}0-9'(). -]+?)(?=\s+\d[\d.]*\s+(?:\d{1,4}[-_.\s]+)?\p{Lu}|$)/gu)]
		.map((match) => ({
			amount: match[1],
			name: cleanTaskEntityName(match[2]),
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
		const targetName = cleanTaskEntityName(targetText);
		return {
			number: Number(number),
			label: "Capturar",
			...(targetName ? { targets: [{ amount: "1", name: targetName }] } : {}),
			details: splitTaskDetails(captureMatch[1]),
		};
	}

	const defeatLabel = text.match(/^Derrotar\s*(\([^)]+\))?/i)?.[1] ?? "";
	const defeatTargets = parseDefeatTargets(text);
	if (defeatTargets.length) {
		return {
			number: Number(number),
			label: cleanStructuredText(`Derrotar ${defeatLabel}`.trim()),
			targets: defeatTargets,
			details: splitTaskDetails(text.replace(/^Derrotar\s*(?:\([^)]+\))?/i, "")),
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
	const rewardBody = stripInlineImageArtifacts(normalizeLine(value).match(/receber[aá]\s+(.+)$/i)?.[1] ?? "");
	return rewardBody
		.split(/\s*,\s*|\s+e\s+/i)
		.map((item) => cleanStructuredText(stripInlineImageArtifacts(item)))
		.filter(Boolean);
}

function normalizeRewardPart(value) {
	return String(value ?? "")
		.replace(/^(?:um|uma)\s+/i, "1 ")
		.replace(/^duas?\s+/i, "2 ")
		.replace(/^tr[eê]s\s+/i, "3 ")
		.trim();
}

function parseClanRewardItems(rewardItems = []) {
	return rewardItems.flatMap((item) => parseSimpleRewardText(normalizeRewardPart(item)));
}

function cleanClanRewardText(value) {
	const text = normalizeLine(value);
	const stop = text.search(/\b(?:Para progredir|Dicas?|Task\s*\||N[íi]vel\s*\|)\b/i);
	return cleanStructuredText(stop >= 0 ? text.slice(0, stop) : text);
}

function parseRankBody(body) {
	const text = normalizeLine(body);
	const introText = text.split(/Etapa\s+1\s*-/i)[0] ?? "";
	const stages = [...text.matchAll(STAGE_RE)].map((match) => parseStage(match[1], match[2]));
	const dangerRoomTeamText = normalizeLine(text.match(/Danger Room Team\s+([\s\S]*?)(?=Ap\S*s concluir|Apos concluir|$)/i)?.[1] ?? "");
	const rewardText = cleanClanRewardText(text.match(/(Ap\S*s concluir[\s\S]*)$/i)?.[1] ?? "");

	const rewardItems = splitRewardText(rewardText);
	const rewards = parseClanRewardItems(rewardItems);

	return {
		intro: splitSentences(introText),
		stages,
		...(dangerRoomTeamText ? { dangerRoomTeamText } : {}),
		...(rewardText ? { rewardText } : {}),
		...(rewardItems.length ? { rewardItems } : {}),
		...(rewards.length ? { rewards } : {}),
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
