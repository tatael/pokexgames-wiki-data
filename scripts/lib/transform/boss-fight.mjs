import { cleanStructuredText, normalizeIdToken } from "./text.mjs";

export function isDifficultySection(normalizedId, normalizedHeading, pageCategory) {
	return normalizedId === "dificuldades"
		|| normalizedId === "dificuldade"
		|| normalizedHeading === "dificuldades"
		|| normalizedHeading === "dificuldade"
		|| (pageCategory === "boss fight" && /dificuld/.test(`${normalizedId} ${normalizedHeading}`));
}

export function parseDifficultyEntries(paragraphs = [], items = []) {
	const intro = [];
	const notes = [];
	const entries = [];
	for (const raw of [...paragraphs, ...items]) {
		const text = String(raw ?? "").trim();
		if (!text) continue;
		const separatorIndex = text.indexOf(":");
		const difficultyLabel = separatorIndex >= 0 ? cleanDisplayDifficultyName(text.slice(0, separatorIndex)) : "";
		if (!isSupportedDifficultyLabel(difficultyLabel)) {
			if (isObservationLine(text)) notes.push(text);
			else intro.push(text);
			continue;
		}

		const name = difficultyLabel;
		const body = text.slice(separatorIndex + 1).trim();
		const normalizedBody = normalizeIdToken(body);
		const minimumLevel = body.match(/(?:mÃ­nimo\s+(?:nÃ­vel|level)|level\s*m[iÃ­]nimo|nÃ­vel\s*m[iÃ­]nimo)\s*(\d+)/i)?.[1]
			?? body.match(/requer\s+no\s+m[iÃ­]nimo\s+(?:nÃ­vel|level)\s*(\d+)/i)?.[1]
			?? normalizedBody.match(/(?:minimo nivel|level minimo|nivel minimo)\s+(\d+)/)?.[1]
			?? normalizedBody.match(/requer no minimo nivel\s+(\d+)/)?.[1]
			?? null;
		const recommendedLevel = body.match(/recomendada?\s+para\s+(?:nÃ­vel|level)\s*(\d+)/i)?.[1]
			?? normalizedBody.match(/recomendada para nivel\s+(\d+)/)?.[1]
			?? normalizedBody.match(/recomendado para nivel\s+(\d+)/)?.[1]
			?? null;
		const levelCap = body.match(/level cap no\s+(?:nÃ­vel|level)\s*(\d+)/i)?.[1]
			?? normalizedBody.match(/level cap no nivel\s+(\d+)/)?.[1]
			?? null;
		const objective = body.match(/dever[aÃ£]o?\s+(.+?)\s+para\s+concluir/i)?.[1] ?? null;
		const requirement = body.match(/necess[aÃ¡]rio\s+que\s+o\s+jogador\s+tenha\s+(\d+)\s+(.+?)(?:\.|$)/i)
			?? normalizedBody.match(/necessario que o jogador tenha\s+(\d+)\s+(.+?)(?:\s*$)/i);
		entries.push({
			name,
			description: body,
			...(minimumLevel ? { minimumLevel: Number(minimumLevel) } : {}),
			...(recommendedLevel ? { recommendedLevel: Number(recommendedLevel) } : {}),
			...(levelCap ? { levelCap: Number(levelCap) } : {}),
			...(objective ? { objective: objective.trim() } : {}),
			...(requirement ? {
				entryRequirement: {
					amount: Number(requirement[1]),
					name: cleanStructuredText(requirement[2]),
				},
			} : {}),
		});
	}

	return { intro, entries, notes };
}

export function isHeldEnhancementSection(normalizedId, normalizedHeading) {
	return normalizedId === "held enhancement"
		|| normalizedId === "informacoes sobre o x boost"
		|| normalizedHeading === "held enhancement"
		|| normalizedHeading === "informacoes sobre o x boost";
}

export function parseHeldEnhancementEntries(paragraphs = [], items = []) {
	const intro = [];
	const notes = [];
	const entries = [];
	for (const raw of paragraphs) {
		const text = String(raw ?? "").trim();
		if (!text) continue;
		const separatorIndex = text.indexOf(":");
		const difficultyLabel = separatorIndex >= 0 ? cleanDisplayDifficultyName(text.slice(0, separatorIndex)) : "";
		if (!isSupportedDifficultyLabel(difficultyLabel)) {
			if (isObservationLine(text)) notes.push(text);
			else intro.push(text);
			continue;
		}

		const body = text.slice(separatorIndex + 1).trim();
		const normalizedBody = normalizeIdToken(body);
		const tiers = [...normalizedBody.matchAll(/tier\s*(\d+)[^0-9]*(\d+)\s+mais\s+dano[^0-9]+(\d+)\s+menos\s+dano/gi)]
			.map((match) => ({
				tier: Number(match[1]),
				damageBonus: Number(match[2]),
				defenseBonus: Number(match[3]),
			}));
		entries.push({
			difficulty: difficultyLabel,
			description: body,
			tiers,
		});
	}

	for (const note of items) {
		const text = String(note ?? "").trim();
		if (text) notes.push(text);
	}

	return { intro, entries, notes };
}

function cleanDisplayDifficultyName(value) {
	const token = normalizeIdToken(value);
	if (token === "facil") return "Fácil";
	if (token === "f cil") return "Fácil";
	if (token === "dificil") return "Difícil";
	if (token === "dif cil") return "Difícil";
	return cleanStructuredText(value);
}

function isSupportedDifficultyLabel(value) {
	return ["Fácil", "Normal", "Difícil", "Elite", "Ultimate", "Easy", "Hard", "Medium", "Platinum"].includes(value);
}

function isObservationLine(value) {
	return normalizeIdToken(value).startsWith("observa");
}
