import { cleanStructuredText, normalizeIdToken, stripImageRefFromText } from "./text.mjs";

function parsePipeRows(items = []) {
	return (items ?? [])
		.filter((item) => String(item ?? "").includes("|"))
		.map((item) => String(item ?? "")
			.split(/\s*\|\s*/)
			.map((part) => cleanStructuredText(part))
			.filter(Boolean))
		.filter((cells) => cells.length >= 2)
		.map((cells) => ({ cells: cells.map((text) => ({ text })) }));
}

function getSupportType(normalizedId, normalizedHeading) {
	const token = `${normalizedId} ${normalizedHeading}`;
	if (/informacoes? importantes?|observacoes?|regras?/.test(token)) return "important-info";
	if (/mecanicas?|estrategia/.test(token)) return "mechanics";
	if (/falha|derrota|eliminacao|condicoes?/.test(token)) return "failure";
	if (/acesso|requisitos?|entrada|localizacao|como chegar/.test(token)) return "access";
	if (/recomendacoes?/.test(token)) return "recommendations";
	if (/leaderboard|ranking|corrida|race/.test(token)) return "leaderboard";
	return "";
}

export function isBossSupportSection(normalizedId, normalizedHeading, pageCategory) {
	return pageCategory === "boss fight" && Boolean(getSupportType(normalizedId, normalizedHeading));
}

export function parseBossSupport(normalizedId, normalizedHeading, paragraphs = [], items = []) {
	const rows = parsePipeRows(items);
	const bullets = (items ?? [])
		.filter((item) => !String(item ?? "").includes("|"))
		.map(cleanStructuredText)
		.filter(Boolean);

	return {
		type: getSupportType(normalizedId, normalizedHeading),
		intro: (paragraphs ?? []).map(cleanStructuredText).filter(Boolean),
		bullets,
		rows,
	};
}

export function isBossRecommendationsSection(normalizedId, normalizedHeading, pageCategory) {
	return pageCategory === "boss fight"
		&& (
			normalizedId === "pokemon recomendados"
			|| normalizedHeading === "pokemon recomendados"
			|| normalizedId === "recomendacoes"
			|| normalizedHeading === "recomendacoes"
		);
}

export function parseBossRecommendations(paragraphs = [], items = []) {
	const intro = [];
	const groups = [];
	let currentGroup = null;
	for (const raw of paragraphs ?? []) {
		const text = cleanStructuredText(raw);
		if (!text) continue;
		const heading = text.match(/^#\s+(.+)/);
		if (heading) {
			currentGroup = {
				label: cleanStructuredText(heading[1]),
				notes: [],
				pokemon: [],
			};

			groups.push(currentGroup);
			continue;
		}

		if (!currentGroup) intro.push(text);
		else currentGroup.notes.push(text);
	}

	const targetGroups = groups.length ? groups : [{ label: "", notes: [], pokemon: [] }];
	if (!groups.length) groups.push(targetGroups[0]);

	const cleanPokemonName = (value) => cleanStructuredText(stripImageRefFromText(value) || value)
		.replace(/\bRedgyarados\b/g, "Red Gyarados");

	const shouldKeepPokemon = (name, groupLabel) => {
		const roleMatch = String(name ?? "").match(/^(.*?)\s*\(PvE:\s*(.*?)\s*\/\s*PvP:\s*(.*?)\)\s*$/i);
		if (!roleMatch) return cleanPokemonName(name);
		const cleanName = cleanPokemonName(roleMatch[1]);
		const groupToken = normalizeIdToken(groupLabel);
		if (/^tanques?$|^tanks?$/.test(groupToken)) {
			const pveToken = normalizeIdToken(roleMatch[2]);
			if (!/(^|\s)tank(?:er)?\s+pve\b/.test(pveToken) || /\boff\s+tank/.test(pveToken)) return "";
		}

		return cleanName;
	};

	const resolveGroupForRow = (index) => {
		if (targetGroups.length === 3 && items.length > targetGroups.length) {
			const firstToken = normalizeIdToken(targetGroups[0]?.label ?? "");
			const middleToken = normalizeIdToken(targetGroups[1]?.label ?? "");
			const lastToken = normalizeIdToken(targetGroups[2]?.label ?? "");
			if (/^tanques?$|^tanks?$/.test(firstToken) && /\bdano\b|\bdamage\b/.test(middleToken) && /\bsuporte\b|\bsupport\b/.test(lastToken)) {
				if (index === 0) return targetGroups[0];
				if (index === items.length - 1) return targetGroups[2];
				return targetGroups[1];
			}
		}

		return targetGroups[Math.min(Math.floor((index * targetGroups.length) / Math.max(items.length, 1)), targetGroups.length - 1)];
	};

	for (const [index, raw] of (items ?? []).entries()) {
		const group = resolveGroupForRow(index);
		const names = String(raw ?? "")
			.split("|")
			.map((part) => cleanStructuredText(part))
			.map((part) => shouldKeepPokemon(part, group?.label ?? ""))
			.filter(Boolean);
		if (!names.length) continue;
		group.pokemon.push(...names);
	}

	return {
		intro,
		groups: groups.filter((group) => group.label || group.notes.length || group.pokemon.length),
	};
}

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
		const cleanedObjective = objective ? sentenceCase(cleanStructuredText(objective)) : "";
		const cleanedRequirementName = requirement ? titleCaseItemName(cleanStructuredText(requirement[2])) : "";
		entries.push({
			name,
			description: body,
			...(minimumLevel ? { minimumLevel: Number(minimumLevel) } : {}),
			...(recommendedLevel ? { recommendedLevel: Number(recommendedLevel) } : {}),
			...(levelCap ? { levelCap: Number(levelCap) } : {}),
			...(cleanedObjective ? { objective: cleanedObjective } : {}),
			...(requirement ? {
				entryRequirement: {
					amount: Number(requirement[1]),
					name: cleanedRequirementName,
				},
			} : {}),
		});
	}

	return { intro, entries, notes };
}

function sentenceCase(value) {
	const text = String(value ?? "").trim();
	if (!text) return "";
	return `${text[0].toLocaleUpperCase("pt-BR")}${text.slice(1)}`;
}

function titleCaseItemName(value) {
	const smallWords = new Set(["de", "da", "do", "das", "dos", "e"]);
	return String(value ?? "")
		.trim()
		.split(/\s+/)
		.map((word, index) => {
			const lower = word.toLocaleLowerCase("pt-BR");
			if (index > 0 && smallWords.has(lower)) return lower;
			return `${lower[0]?.toLocaleUpperCase("pt-BR") ?? ""}${lower.slice(1)}`;
		})
		.join(" ");
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
		const explicitTiers = [...normalizedBody.matchAll(/tier\s*(\d+)[^0-9]*(\d+)\s+mais\s+dano[^0-9]+(\d+)\s+menos\s+dano/gi)]
			.map((match) => ({
				tier: Number(match[1]),
				damageBonus: Number(match[2]),
				defenseBonus: Number(match[3]),
			}));

		const proseTiers = [...body.matchAll(/tier\s*(\d+)[^%.]{0,120}?(\d+)\s*%/gi)]
			.map((match) => ({
				tier: Number(match[1]),
				damageBonus: Number(match[2]),
				defenseBonus: Number(match[2]),
			}));

		const tierMentions = [...body.matchAll(/tier\s*(\d+)/gi)]
			.map((match) => Number(match[1]))
			.filter((value) => Number.isFinite(value));
		const percentMentions = [...body.matchAll(/(\d+)\s*%/g)]
			.map((match) => Number(match[1]))
			.filter((value, index, values) => Number.isFinite(value) && values.indexOf(value) === index);
		const orderedProseTiers = tierMentions.length && percentMentions.length >= tierMentions.length
			? tierMentions.map((tier, index) => ({
				tier,
				damageBonus: percentMentions[index],
				defenseBonus: percentMentions[index],
			}))
			: [];

		const tiersByTier = new Map();
		for (const tier of [...explicitTiers, ...proseTiers, ...orderedProseTiers]) {
			if (!Number.isFinite(tier.tier) || !Number.isFinite(tier.damageBonus)) continue;
			tiersByTier.set(tier.tier, tier);
		}

		const tiers = [...tiersByTier.values()].sort((a, b) => a.tier - b.tier);
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
	return ["Fácil", "Normal", "Difícil", "Elite", "Ultimate", "Easy", "Hard", "Medium", "Platinum", "Ultra", "Hyper", "Master", "Grand Master"].includes(value);
}

function isObservationLine(value) {
	return normalizeIdToken(value).startsWith("observa");
}
