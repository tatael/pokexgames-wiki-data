import { cleanStructuredText, displayStructuredText, normalizeForRarity, normalizeIdToken, stripImageRefFromText } from "./text.mjs";

const REWARD_RARITY_TOKENS = new Set([
	"comum", "raro", "semiraro", "epico", "epica", "ultrararo", "lendario", "lendaria", "mitico", "mitica"
]);
const RANKING_PLACE_RE = /^\d+[\u00ba\u00aa\u00b0]?(\s+ao\s+\d+[\u00ba\u00aa\u00b0]?)?\s*(lugar|place)/i;
const DIFFICULTY_RE = /\s*\(\s*(F\u00e1cil|Normal|Dif\u00edcil|Easy|Hard)\s*\)\s*/i;

function isRarityText(value) {
	return REWARD_RARITY_TOKENS.has(normalizeForRarity(value));
}

function stripPrizeRefFromText(text) {
	let s = String(text ?? "").trim();
	if (!s) return s;
	let words = s.split(" ");
	let changed = true;
	while (changed) {
		changed = false;
		for (let half = Math.floor(words.length / 2); half >= 1; half--) {
			if (half * 2 !== words.length) continue;
			if (words.slice(0, half).join(" ").toLowerCase() === words.slice(half).join(" ").toLowerCase()) {
				s = words.slice(half).join(" "); words = s.split(" "); changed = true; break;
			}
		}

		if (changed) continue;
		for (let i = 0; i < words.length - 1; i++) {
			const lw = words[i].toLowerCase();
			for (let j = i + 1; j < words.length; j++) {
				if (words[j].toLowerCase() === lw) {
					s = words.slice(i + 1).join(" "); words = s.split(" "); changed = true; break;
				}
			}

			if (changed) break;
		}

		if (changed) continue;
		if (words.length >= 2) {
			const fn = words[0].toLowerCase().replace(/[^a-z]/g, "");
			const rn = words.slice(1).join("").toLowerCase().replace(/[^a-z]/g, "");
			if (fn.length >= 3 && rn.startsWith(fn)) {
				s = words.slice(1).join(" "); words = s.split(" "); changed = true;
			}
		}
	}

	return s.trim();
}

function parsePrizeBlob(text) {
	const tokens = String(text ?? "").trim().split(/\s+/);
	const segments = [];
	let current = null;
	for (const tok of tokens) {
		if (/^\d+(?:[.,]\d+)?$/.test(tok)) {
			if (current) segments.push(current);
			current = { qty: tok, nameParts: [] };
		} else if (/\.(gif|png|jpg|jpeg|webp|svg)$/i.test(tok)) {
			if (current) current.nameParts = [];
		} else {
			if (!current) current = { qty: "", nameParts: [] };
			current.nameParts.push(tok);
		}
	}

	if (current) segments.push(current);
	return segments
		.map((seg) => {
			const name = stripPrizeRefFromText(seg.nameParts.join(" "));
			return name ? { qty: seg.qty, name } : null;
		})
		.filter(Boolean);
}

function normalizeExperienceRewardName(value) {
	const token = normalizeIdToken(value);

	if (token === "exp icon nw" || token === "nightmare experience") {
		return { name: "Nightmare Experience", icon: "nightmare-xp" };
	}

	if (token === "exp icon" || token === "xp" || token === "experience" || token === "experiencia") {
		return { name: "Experiência", icon: "xp" };
	}

	return { name: cleanLootRewardName(value) };
}

function splitRewardTextParts(value) {
	return String(value ?? "")
		.replace(/\s+e\s+(?=\d)/gi, ", ")
		.split(/\s*,\s*|\s+(?=\d[\d.]*\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/)
		.map((part) => part.trim())
		.filter(Boolean);
}

export function parseSimpleRewardText(value) {
	const text = String(value ?? "").split(/itens possiveis|itens possíveis/i)[0].trim();

	if (!text) return [];

	if (/exp icon/i.test(text)) {
		const rewards = [];
		const xp = text.match(/Exp icon\s+([\d.]+)/i);
		const nw = text.match(/Exp icon nw\s+([\d.]+)/i);

		if (xp) {
			rewards.push({
				type: "loot",
				name: "Experiência",
				icon: "xp",
				rarity: null,
				difficulty: null,
				qty: xp[1],
			});
		}

		if (nw) {
			rewards.push({
				type: "loot",
				name: "Nightmare Experience",
				icon: "nightmare-xp",
				rarity: null,
				difficulty: null,
				qty: nw[1],
			});
		}

		const remainder = text
			.replace(/Exp icon\s+[\d.]+/gi, " ")
			.replace(/Exp icon nw\s+[\d.]+/gi, " ")
			.replace(/\s+/g, " ")
			.trim();

		for (const match of remainder.matchAll(/\b([A-Z][A-Za-z ]*?(?:Gem|Gems|Ball|Balls|Token|Tokens))\s+(\d[\d.]*)\s+\1\b/gi)) {
			rewards.push({
				type: "loot",
				name: cleanLootRewardName(match[1]),
				rarity: null,
				difficulty: null,
				qty: match[2],
			});
		}

		if (rewards.length) return rewards;
	}

	const numericPrefix = text.match(/^(\d[\d.]*)\s+(\d[\d.]*)(?:\s+([\s\S]+))?$/);

	if (numericPrefix) {
		const rewards = [
			{
				type: "loot",
				name: "Experiência",
				icon: "xp",
				rarity: null,
				difficulty: null,
				qty: numericPrefix[1],
			},
			{
				type: "loot",
				name: "Nightmare Experience",
				icon: "nightmare-xp",
				rarity: null,
				difficulty: null,
				qty: numericPrefix[2],
			},
		];

		if (numericPrefix[3]) rewards.push(...parseSimpleRewardText(numericPrefix[3]));

		return rewards;
	}

	return splitRewardTextParts(text).flatMap((part) => {
		const exp = part.match(/^([\d.]+k?)\s+de\s+experi[êe]ncia$/i);

		if (exp) {
			return [{
				type: "loot",
				name: "Experiência",
				icon: "xp",
				rarity: null,
				difficulty: null,
				qty: exp[1],
			}];
		}

		const iconReward = part.match(/^(Exp icon nw|Exp icon)\s+([\d.]+)$/i);

		if (iconReward) {
			const normalized = normalizeExperienceRewardName(iconReward[1]);

			return [{
				type: "loot",
				...normalized,
				rarity: null,
				difficulty: null,
				qty: iconReward[2],
			}];
		}

		const match = part.match(/^([\d.]+k?)\s+(?:de\s+)?(.+)$/i);

		if (!match) return [];

		return [{
			type: "loot",
			...normalizeExperienceRewardName(match[2]),
			rarity: null,
			difficulty: null,
			qty: match[1],
		}];
	});
}

export function parseRewardItemText(item) {
	const raw = String(item ?? "").trim();
	if (!raw) return null;
	const normalizedRaw = normalizeIdToken(raw);
	if (["item raridade", "item quantidade raridade", "colocacao recompensa"].includes(normalizedRaw)) return null;
	if (/^(facil|normal|dificil|easy|hard|platinum|ultra|hyper|master|grand master|gold|nightmare|especialista|expert|recompensa semanal|recompensa de temporada)$/.test(normalizedRaw)) {
		return { type: "difficulty", difficulty: raw };
	}

	const pipeIdx = raw.indexOf("|");
	if (pipeIdx >= 0) {
		const firstRaw = raw.slice(0, pipeIdx).trim();
		const firstClean = stripImageRefFromText(firstRaw) || firstRaw;
		if (RANKING_PLACE_RE.test(firstClean)) {
			const prizes = parsePrizeBlob(raw.slice(pipeIdx + 1).trim());
			return { type: "ranking", place: firstClean, prizes };
		}
	}

	const parts = raw
		.split(/\s*\|\s*/)
		.map((part) => {
			const trimmed = part.trim();
			if (/^\d+(?:[.,]\d+)?(?:\s*a\s*\d+(?:[.,]\d+)?)?$/i.test(trimmed)) {
				return trimmed;
			}

			return stripImageRefFromText(trimmed);
		})
		.filter(Boolean);
	if (!parts.length) return null;

	const lastPart = parts[parts.length - 1];
	if (isRarityText(lastPart)) {
		const remaining = parts.slice(0, -1);
		const maybeQty = remaining.length >= 2 ? remaining[remaining.length - 1] : null;
		const isQty = maybeQty !== null && /^\d+(\s*a\s*\d+)?$/.test(maybeQty);
		let name = isQty
			? (remaining.slice(0, -1).pop() ?? remaining[0] ?? "")
			: (remaining[remaining.length - 1] ?? remaining[0] ?? "");
		let qty = isQty ? maybeQty : null;
		const parsedNameMeta = parseTrailingRewardMeta(name);
		if (!qty && parsedNameMeta.qty) {
			name = parsedNameMeta.name;
			qty = parsedNameMeta.qty;
		}

		let difficulty = null;
		const diffMatch = String(name).match(DIFFICULTY_RE);
		if (diffMatch) {
			difficulty = diffMatch[1];
			name = String(name).replace(DIFFICULTY_RE, "").trim();
		}

		return { type: "loot", name: cleanLootRewardName(name || ""), difficulty, rarity: lastPart, qty };
	}

	const rawName = parts[parts.length - 1] || parts[0] || "";
	const parsedMeta = parseTrailingRewardMeta(rawName);
	return { type: "loot", name: parsedMeta.name, difficulty: null, rarity: parsedMeta.rarity, qty: parsedMeta.qty };
}

export function propagateDifficulty(rewards) {
	let currentDifficulty = null;
	return rewards.flatMap((reward) => {
		if (reward.type === "difficulty") {
			currentDifficulty = reward.difficulty;
			return [];
		}

		if (reward.type === "loot") {
			if (reward.difficulty !== null) {
				currentDifficulty = reward.difficulty;
			} else if (currentDifficulty !== null) {
				return [{ ...reward, difficulty: currentDifficulty }];
			}
		}

		return [reward];
	});
}

function normalizeRewardName(value) {
	return normalizeIdToken(value).replace(/\s+/g, " ");
}

function normalizeRewardFamilyName(value) {
	return normalizeRewardName(value).replace(/\bs$/, "");
}

function cleanLootRewardName(value) {
	let name = stripPrizeRefFromText(value);
	name = name.replace(/\bDarknesss\b/gi, "Darkness");
	const words = name.split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		const first = words[0].toLowerCase().replace(/s$/, "");
		const second = words[1].toLowerCase().replace(/s$/, "");
		if (first && first === second) name = words.slice(1).join(" ");
	}

	return name.trim();
}

function parseTrailingRewardMeta(rawName) {
	const text = String(rawName ?? "").trim();
	if (!text) return { name: "", qty: null, rarity: null };

	const leadingQtyMatch = text.match(/^(\d+(?:[.,]\d+)?(?:\s*a\s*\d+(?:[.,]\d+)?)?)\s+(.+)$/i);
	if (leadingQtyMatch) {
		return {
			name: cleanLootRewardName(leadingQtyMatch[2]),
			qty: leadingQtyMatch[1]?.trim() ?? null,
			rarity: null,
		};
	}

	const qtyMatch = text.match(/^(.*?)\s*\(([^)]*?\d[^)]*)\)\s*$/);
	if (qtyMatch) {
		return {
			name: cleanLootRewardName(qtyMatch[1]),
			qty: qtyMatch[2]?.trim() ?? null,
			rarity: null,
		};
	}

	const rarityMatch = text.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
	const rarityText = rarityMatch?.[2] ? displayStructuredText(rarityMatch[2]) : "";
	if (rarityText && isRarityText(rarityText)) {
		return {
			name: cleanLootRewardName(rarityMatch[1]),
			qty: null,
			rarity: rarityText,
		};
	}

	return {
		name: cleanLootRewardName(text),
		qty: null,
		rarity: null,
	};
}

export function ensureLegendaryBossRewards(rewards) {
	const loot = rewards.filter((reward) => reward?.type === "loot");
	const difficulties = new Set(loot.map((reward) => normalizeIdToken(reward.difficulty)).filter(Boolean));
	if (!difficulties.has("facil") || !difficulties.has("normal") || !difficulties.has("dificil")) return rewards;

	const easyLegendary = loot.filter((reward) =>
		normalizeIdToken(reward.difficulty) === "facil"
		&& normalizeIdToken(reward.rarity) === "lendario"
		&& /\b(tv camera|backpack|amulet)\b/i.test(String(reward.name ?? ""))
	);
	const normalSpecial = loot.filter((reward) =>
		normalizeIdToken(reward.difficulty) === "normal"
		&& /\b(sewing kit|essence)\b/i.test(String(reward.name ?? ""))
	);
	if (!easyLegendary.length && !normalSpecial.length) return rewards;

	const output = [...rewards];
	for (const difficulty of ["Normal", "Difícil"]) {
		const existingNames = new Set(
			loot
				.filter((reward) => normalizeIdToken(reward.difficulty) === normalizeIdToken(difficulty))
				.map((reward) => normalizeRewardName(reward.name))
		);
		for (const item of easyLegendary) {
			const key = normalizeRewardName(item.name);
			if (!key || existingNames.has(key)) continue;
			output.push({ ...item, difficulty });
			existingNames.add(key);
		}

		if (normalizeIdToken(difficulty) === "dificil") {
			for (const item of normalSpecial) {
				const key = normalizeRewardName(item.name);
				if (!key || existingNames.has(key)) continue;
				output.push({ ...item, difficulty });
				existingNames.add(key);
			}
		}
	}

	return output;
}

export function fillSparseDifficultyRewards(rewards) {
	const difficultyOrder = [];
	const sourceByDifficulty = new Map();
	const completedByDifficulty = new Map();

	for (const reward of rewards) {
		if (reward?.type !== "loot" || !reward.difficulty) {
			continue;
		}

		const difficultyKey = normalizeIdToken(reward.difficulty);
		if (!sourceByDifficulty.has(difficultyKey)) {
			sourceByDifficulty.set(difficultyKey, []);
			difficultyOrder.push(difficultyKey);
		}

		sourceByDifficulty.get(difficultyKey).push(reward);
	}

	if (difficultyOrder.length < 2) return rewards;

	let baseline = [];
	for (const difficultyKey of difficultyOrder) {
		const items = sourceByDifficulty.get(difficultyKey) ?? [];
		const hasSparseRows = baseline.length >= 4 && items.length < baseline.length;
		if (!hasSparseRows) {
			baseline = mergeRewardBaseline(baseline, items);
			completedByDifficulty.set(difficultyKey, items);
			continue;
		}

		const currentByName = new Map(items.map((item) => [normalizeRewardFamilyName(item.name), item]));
		const targetDifficulty = items[0]?.difficulty ?? baseline[0]?.difficulty ?? null;
		const completed = [];
		const seen = new Set();
		for (const item of baseline) {
			const key = normalizeRewardFamilyName(item.name);
			const current = currentByName.get(key);
			completed.push(current ? { ...current, difficulty: targetDifficulty } : { ...item, difficulty: targetDifficulty });
			seen.add(key);
		}

		for (const item of items) {
			const key = normalizeRewardFamilyName(item.name);
			if (seen.has(key)) continue;
			completed.push(item);
			seen.add(key);
		}

		completedByDifficulty.set(difficultyKey, completed);
		baseline = mergeRewardBaseline(baseline, completed);
	}

	return rewards.flatMap((reward) => {
		if (reward?.type !== "loot" || !reward.difficulty) return [reward];
		const difficultyKey = normalizeIdToken(reward.difficulty);
		const completed = completedByDifficulty.get(difficultyKey);
		if (!completed?.length) return [reward];
		const firstSource = sourceByDifficulty.get(difficultyKey)?.[0];
		return reward === firstSource ? completed : [];
	});
}

function mergeRewardBaseline(previous, current) {
	const merged = [...previous];
	const indexByName = new Map(previous.map((item, index) => [normalizeRewardFamilyName(item.name), index]));
	for (const item of current) {
		const key = normalizeRewardFamilyName(item.name);
		if (indexByName.has(key)) {
			merged[indexByName.get(key)] = item;
		} else {
			indexByName.set(key, merged.length);
			merged.push(item);
		}
	}

	return merged;
}

export function dedupeRewards(rewards) {
	const seen = new Set();
	return rewards.filter((reward) => {
		const key = [
			reward?.type,
			normalizeIdToken(reward?.difficulty),
			normalizeIdToken(reward?.name),
			normalizeIdToken(reward?.rarity),
			normalizeIdToken(reward?.qty),
			normalizeIdToken(reward?.place),
			...(reward?.prizes ?? []).flatMap((prize) => [
				normalizeIdToken(prize?.name),
				normalizeIdToken(prize?.qty),
			]),
		].join("|");
		if (!key.replace(/\|/g, "") || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
