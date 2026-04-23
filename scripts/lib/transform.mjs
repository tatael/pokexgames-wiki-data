import { PT_BR, buildSlug } from "./shared.mjs";

const REWARD_RARITY_TOKENS = new Set([
	"comum", "raro", "semiraro", "epico", "epica", "ultrararo", "lendario", "lendaria", "mitico", "mitica"
]);
const FACT_LABEL_RE = /(Nome|Level|Elemento|Habilidades?|Boost|Materia)\s*:/gi;
const KNOWN_MATERIA_SLUGS = new Set([
	"gardestrike",
	"psycraft",
	"seavell",
	"volcanic",
	"malefic",
	"orebound",
	"ironhard",
	"raibolt",
	"naturia",
	"wingeon"
]);
const RANKING_PLACE_RE = /^\d+[ºª°]?(\s+ao\s+\d+[ºª°]?)?\s*(lugar|place)/i;
const DIFFICULTY_RE = /\s*\(\s*(Fácil|Normal|Difícil|Easy|Hard)\s*\)\s*/i;
const TIER_SECTION_PATTERN = /^(?:tier|t)\s*([a-z0-9ivx+-]+)$/i;
const SECTION_KIND_BY_ID = {
	"informacoes-importantes": "info",
	"informacoes-gerais": "info",
	"informacoes": "info",
	"observacoes": "info",
	"held-enhancement": "info",
	"habilidades": "info",
	"localizacao": "prose",
	"localizacoes": "prose",
	"efetividade": "prose",
	"dificuldades": "prose",
	"historia": "prose",
	"lore": "prose",
	"pokemon-recomendados": "pokemon-group",
	"pokemon": "pokemon-group",
	"pokemons": "pokemon-group",
	"recompensa": "rewards",
	"recompensas": "rewards",
	"rewards": "rewards"
};

const TASK_START_RE = /^(?:\d+[ºª°]?\s*)?(derrotar|coletar|entregar|parte\s+\d+)/i;
const TASK_LEVEL_RE = /\b(?:level|lvl|nw level|level minimo|level mínimo)\b/i;
const TASK_REWARD_RE = /(?:\d[\d.]*\s+(?:xp|experience|nightmare|cyan|black|gem|ball|token)|\$\s*[\d.]+|^\d[\d.]*\s+\d)/i;
const FACT_LINE_RE = /^([^:]{2,36}):\s*(.+)$/;

function normalizeForRarity(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

function cleanStructuredText(value) {
	return String(value ?? "")
		.replace(/\s+/g, " ")
		.replace(/\s+\./g, ".")
		.trim()
		.replace(/[.,;:]$/, "")
		.trim();
}

function displayStructuredText(value) {
	const text = cleanStructuredText(value);
	if (!text) return "";
	const lower = text.toLowerCase();
	if (lower === "none" || lower === "nenhuma" || lower === "nenhum") return "Nenhuma";
	return text;
}

function dedupeBySlug(values, slugger) {
	const seen = new Set();
	return values.filter((value) => {
		const key = slugger(value);
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function parseElementListText(value) {
	if (!value) return [];
	return dedupeBySlug(
		String(value)
			.split(/\s*(?:\/|,| and | e | y | ou | or )\s*/i)
			.map((item) => displayStructuredText(item))
			.filter(Boolean),
		(item) => buildSlug(item, "")
	);
}

function splitAbilitiesText(value) {
	if (!value) return [];
	return dedupeBySlug(
		String(value)
			.split(/\s*(?:,| and | e | y )\s*/i)
			.map((item) => displayStructuredText(item))
			.filter(Boolean),
		(item) => buildSlug(item, "")
	);
}

function splitMateriaTargetsText(value) {
	if (!value) return [];
	return dedupeBySlug(
		String(value)
			.split(/\s*(?:\/| ou | and | e | or )\s*/i)
			.map((item) => displayStructuredText(item))
			.filter(Boolean),
		(item) => buildSlug(item, "")
	);
}

function parsePokemonProfileText(text) {
	const source = cleanStructuredText(text);
	if (!source || !/Nome\s*:/i.test(source) || !/Level\s*:/i.test(source)) return null;

	const matches = [...source.matchAll(FACT_LABEL_RE)];
	if (!matches.length) return null;

	const rawFacts = {};
	for (let index = 0; index < matches.length; index += 1) {
		const current = matches[index];
		const next = matches[index + 1];
		const key = current[1].toLowerCase();
		const start = (current.index ?? 0) + current[0].length;
		const end = next ? (next.index ?? source.length) : source.length;
		rawFacts[key] = cleanStructuredText(source.slice(start, end));
	}

	const name = displayStructuredText(rawFacts.nome);
	return {
		name,
		level: displayStructuredText(rawFacts.level),
		elements: parseElementListText(rawFacts.elemento),
		abilities: splitAbilitiesText(rawFacts.habilidades ?? rawFacts.habilidade),
		boost: displayStructuredText(rawFacts.boost),
		boostSlug: rawFacts.boost ? "calculadora-de-boost" : null,
		materia: displayStructuredText(rawFacts.materia),
		materiaTargets: splitMateriaTargetsText(rawFacts.materia).map((label) => {
			const slug = String(label)
				.split(/\s+/)
				.map((part) => buildSlug(part, ""))
				.find((token) => KNOWN_MATERIA_SLUGS.has(token))
				|| buildSlug(label, "");
			return { label, slug };
		}),
		heroSlug: buildSlug(name, "")
	};
}

function isRarityText(value) {
	return REWARD_RARITY_TOKENS.has(normalizeForRarity(value));
}

function normalizeIdToken(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function stripImageRefFromText(text) {
	let s = String(text ?? "").trim();
	if (!s) return "";
	if (/^[^\s]+\.(gif|png|jpg|jpeg|webp|svg)$/i.test(s)) return "";
	s = s.replace(/^\S+\.(gif|png|jpg|jpeg|webp|svg)\s+/i, "");
	s = s.replace(/^\d+-\w+ /, "");
	s = s.replace(/\s*\*+$/, "").trim();

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

	if (words.length >= 2 && /^[a-z]/.test(words[0])) {
		const rest = words.slice(1);
		const nextUpper = rest.findIndex((w) => /^[A-Z]/.test(w));
		if (nextUpper >= 0) s = rest.slice(nextUpper).join(" ");
	}

	return s.replace(/^thread\s+/i, "").trim();
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

function parseSimpleRewardText(value) {
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
		if (current?.objective) tasks.push(current);
		current = null;
	};

	for (const rawLine of lines) {
		const line = cleanStructuredText(rawLine);

		if (!line || /^#|^-{3,}$/.test(line) || normalizeIdToken(line) === "indice") continue;

		if (looksLikeTaskStartText(line)) {
			pushCurrent();
			current = { objective: line, requirements: [], rewards: [], notes: [], targets: [] };
			continue;
		}

		if (!current) current = { objective: "", requirements: [], rewards: [], notes: [], targets: [] };

		if (TASK_LEVEL_RE.test(line)) current.requirements.push(line);
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

		const title = cells[0].replace(/^\d+\.\s*/, "").trim();
		const objective = cleanTaskObjectiveText(cells.find(looksLikeTaskStartText) ?? "");

		if (!objective) return null;

		const requirements = rawCells.filter((cell) => TASK_LEVEL_RE.test(cell));
		const rewardCell = rawCells.find((cell) => /exp icon|nightmare gem|beast ball|nightmare ball|cyan/i.test(cell) && looksLikeTaskRewardText(cell));
		const notes = cells.filter((cell) => cell !== title && cell !== objective && !requirements.includes(cell) && cell !== rewardCell);

		return {
			title,
			objective,
			requirements,
			rewards: rewardCell ? parseSimpleRewardText(rewardCell) : [],
			notes,
			targets: [objective],
		};
	}).filter(Boolean);
}

function parseTaskRows(paragraphs = [], items = []) {
	const pipeTasks = parseTaskRowsFromPipeItems(items);

	if (pipeTasks.length) return pipeTasks;

	return parseTaskRowsFromLines([...paragraphs, ...items]);
}

function parseFactRows(values = []) {
	const rows = [];

	for (const value of values) {
		const text = cleanStructuredText(value);

		if (!text || text.length > 180 || text.startsWith("#")) continue;

		const match = text.match(FACT_LINE_RE);

		if (!match) continue;

		const label = cleanStructuredText(match[1]);
		const content = cleanStructuredText(match[2]);

		if (!label || !content || /https?:\/\//i.test(content)) continue;

		rows.push({ label, value: content });
	}

	return rows;
}

export function parsePokemonItemText(item) {
	const s = String(item ?? "").trim();
	const pvxIdx = s.lastIndexOf("(PvE:");
	if (pvxIdx === -1) return null;
	const namePart = s.slice(0, pvxIdx).trim();
	const rolePart = s.slice(pvxIdx);
	const roleMatch = rolePart.match(/^\(PvE:\s*(.*?)\s*\/\s*PvP:\s*(.*?)\)\s*$/);
	if (!roleMatch) return null;
	const exclusive = namePart.endsWith("*");
	const name = namePart.replace(/\s*\*\s*$/, "").trim();
	const cleanRole = (value) => {
		const role = String(value ?? "")
			.replace(/\bLink\b/gi, "")
			.split("/")
			.map((part) => part.replace(/\s+/g, " ").trim())
			.filter(Boolean)
			.join(" / ");
		return role || "Not";
	};
	return {
		name,
		exclusive,
		pve: cleanRole(roleMatch[1]),
		pvp: cleanRole(roleMatch[2])
	};
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
		.map((p) => stripImageRefFromText(p.trim()))
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

		let difficulty = null;
		const diffMatch = String(name).match(DIFFICULTY_RE);
		if (diffMatch) {
			difficulty = diffMatch[1];
			name = String(name).replace(DIFFICULTY_RE, "").trim();
		}

		return { type: "loot", name: cleanLootRewardName(name || ""), difficulty, rarity: lastPart, qty: isQty ? maybeQty : null };
	}

	const rawName = parts[parts.length - 1] || parts[0] || "";
	const parsedMeta = parseTrailingRewardMeta(rawName);
	return { type: "loot", name: parsedMeta.name, difficulty: null, rarity: parsedMeta.rarity, qty: parsedMeta.qty };
}

function propagateDifficulty(rewards) {
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

function ensureLegendaryBossRewards(rewards) {
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

function dedupeRewards(rewards) {
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

function parseMoveRowText(moveLine, levelLine) {
	const [rawName = "", rawKind = "", rawElement = ""] = String(moveLine ?? "")
		.split("|")
		.map((item) => cleanStructuredText(item));
	if (!rawName) return null;
	const cooldownMatch = rawName.match(/\(([^)]+)\)\s*$/);
	const name = cooldownMatch ? rawName.slice(0, cooldownMatch.index).trim() : rawName;
	return {
		name,
		cooldown: cooldownMatch?.[1] ?? "",
		element: rawElement,
		level: levelLine ? cleanStructuredText(levelLine) : "",
		traits: rawKind ? rawKind.split(/\s+/).filter(Boolean) : []
	};
}

function parseMoveGroupsText(paragraphs = [], items = [], sectionLabel = "Movimentos") {
	const headings = paragraphs
		.map((paragraph) => String(paragraph ?? "").trim().match(/^#\s+(.+)/)?.[1]?.trim())
		.filter(Boolean);

	const rows = [];
	for (let index = 0; index < items.length; index += 1) {
		const current = cleanStructuredText(items[index]);
		if (!current) continue;
		const next = cleanStructuredText(items[index + 1] ?? "");
		if (/^Level\b/i.test(next)) {
			const row = parseMoveRowText(current, next);
			if (row) rows.push(row);
			index += 1;
			continue;
		}

		const row = parseMoveRowText(current, "");
		if (row) rows.push(row);
	}

	if (!rows.length) return [];
	if (!headings.length) return [{ label: sectionLabel, rows }];
	const groupSize = Math.ceil(rows.length / headings.length);
	return headings
		.map((label, index) => ({
			label,
			rows: rows.slice(index * groupSize, (index + 1) * groupSize)
		}))
		.filter((group) => group.rows.length);
}

function parseEffectivenessGroupsText(paragraphs = []) {
	const text = cleanStructuredText(paragraphs.join(" "));
	if (!text.includes(":")) return [];
	const groups = [];
	for (const match of text.matchAll(/([^.:]+):\s*([^.:]+)(?:\.|$)/g)) {
		const label = cleanStructuredText(match[1]);
		const values = dedupeBySlug(
			String(match[2] ?? "")
				.split(/\s*(?:,| and | e | y )\s*/i)
				.map((item) => displayStructuredText(item))
				.filter((item) => item && item !== "-"),
			(item) => buildSlug(item, "")
		);
		if (label && values.length) groups.push({ label, values });
	}

	return groups;
}

function stripTechnicalVariantSuffix(value) {
	return String(value ?? "")
		.replace(/\s*\(([Tt][MmRr])\)\s*$/g, "")
		.replace(/^\s*(TM|TR)\s+/i, "")
		.trim();
}

function parseVariantEntryText(raw) {
	const parts = String(raw ?? "")
		.split("|")
		.map((part) => cleanStructuredText(stripImageRefFromText(part)))
		.filter(Boolean);
	if (!parts.length) return null;
	const label = parts[parts.length - 1];
	const normalizedLabel = stripTechnicalVariantSuffix(label);
	const slug = buildSlug(normalizedLabel || label, "");
	if (!slug) return null;
	return {
		label,
		slug,
		imageSlug: slug,
		badge: /\((tm|tr)\)$/i.test(label) ? label.match(/\((tm|tr)\)$/i)?.[1]?.toUpperCase() ?? "" : ""
	};
}

function looksLikeRawPokemonReferenceText(value) {
	const text = String(value ?? "").trim();
	if (!text) return false;
	if (text.includes("|")) {
		const parts = text.split(/\s*\|\s*/).filter(Boolean);
		return parts.length > 0 && parts.every(looksLikeRawPokemonReferenceText);
	}
	if (/^\d{3,4}\s*[-_.]\s*(?:sh|shiny|mega|alolan|galarian|hisuian)?\s*[a-z0-9' ._-]+$/i.test(text)) return true;
	if (/^\d{3,4}\s*[-_.]\s*(?:sh|shiny|mega|alolan|galarian|hisuian)?\s*[a-z0-9' ._-]+\s+[a-z][a-z0-9' ._-]*$/i.test(text)) return true;
	if (/^\d{3,4}\s*[-_.]\s*\S+\.(?:png|gif|webp|jpe?g)\s+\d{3,4}\s*[-_.]\s*.+$/i.test(text)) return true;
	if (/^\S+\.(?:png|gif|webp|jpe?g)\s+\d{3,4}\s*[-_.]\s*.+$/i.test(text)) return true;
	return /^\S+\.(?:png|gif|webp|jpe?g)\s+\S.+$/i.test(text);
}

function cleanRawPokemonReferenceItems(itemsByLocale = {}) {
	const cleaned = {};
	for (const locale of Object.keys(itemsByLocale ?? {})) {
		cleaned[locale] = (itemsByLocale[locale] ?? [])
			.filter((item) => !looksLikeRawPokemonReferenceText(item));
	}
	return cleaned;
}

function classifySectionKind(id, headingText) {
	const normId = normalizeIdToken(id);
	const normIdNoSpace = normId.replace(/ /g, "");
	if (TIER_SECTION_PATTERN.test(normId) || TIER_SECTION_PATTERN.test(normIdNoSpace)) {
		return "tier";
	}
	if (/^nivel \d+ ao \d+$/.test(normId) || /^level \d+ to \d+$/.test(normId)) {
		return "tasks";
	}
	if (normId === "nightmare tasks") {
		return "tasks";
	}

	const normHeading = normalizeIdToken(headingText ?? "");
	if (/^nivel \d+ ao \d+$/.test(normHeading) || /^level \d+ to \d+$/.test(normHeading)) {
		return "tasks";
	}
	if (normHeading === "recompensa" || normHeading === "recompensas" || normHeading === "rewards" || /premios|premiacoes|premios dos baus/.test(normHeading)) {
		return "rewards";
	}

	if (/^habilidades?(\s+|$)/.test(normHeading)) {
		return "info";
	}

	if (normHeading === "pokemon" || normHeading === "pokemons" || normHeading === "pokemon recomendados") {
		return "pokemon-group";
	}

	if (normHeading && (TIER_SECTION_PATTERN.test(normHeading) || TIER_SECTION_PATTERN.test(normHeading.replace(/ /g, "")))) {
		return "tier";
	}

	return SECTION_KIND_BY_ID[id] ?? "prose";
}

export function structureSection(section) {
	const id = section.id ?? "";
	const headingText = section.heading?.[PT_BR] ?? "";
	const kind = classifySectionKind(id, headingText);
	const result = { ...section, kind };
	const normalizedId = normalizeIdToken(id);

	if (!["rewards", "tier", "pokemon-group", "tasks"].includes(kind)) {
		result.items = cleanRawPokemonReferenceItems(section.items);
	}

	if (kind === "tier") {
		const pokemon = {};
		for (const locale of Object.keys(section.items ?? {})) {
			pokemon[locale] = (section.items[locale] ?? [])
				.map(parsePokemonItemText)
				.filter(Boolean);
		}

		result.pokemon = pokemon;
	}

	if (kind === "rewards") {
		const rewards = {};
		for (const locale of Object.keys(section.items ?? {})) {
			const parsed = (section.items[locale] ?? [])
				.map(parseRewardItemText)
				.filter(Boolean);
			rewards[locale] = dedupeRewards(ensureLegendaryBossRewards(propagateDifficulty(parsed)));
		}

		result.rewards = rewards;
	}

	if (kind === "pokemon-group") {
		const cleanedItems = {};
		for (const locale of Object.keys(section.items ?? {})) {
			cleanedItems[locale] = (section.items[locale] ?? [])
				.map((item) =>
					String(item ?? "")
						.split(/\s*\|\s*/)
						.map((p) => stripImageRefFromText(p.trim()))
						.filter(Boolean)
						.join(" | ")
				)
				.filter(Boolean);
		}

		result.items = cleanedItems;
	}

	if (kind === "tasks") {
		const tasks = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {})
		])) {
			const paragraphs = section.paragraphs?.[locale] ?? [];
			const items = section.items?.[locale] ?? [];
			const parsed = parseTaskRows(paragraphs, items);
			if (parsed.length) {
				tasks[locale] = parsed;
			} else {
				const rewards = paragraphs.length ? parseSimpleRewardText(paragraphs[0]) : [];
				const targets = items
					.flatMap((item) => String(item ?? "").split(/\s*\|\s*/))
					.map((item) => stripImageRefFromText(item.trim()))
					.filter(Boolean);
				tasks[locale] = [{
					objective: section.heading?.[locale] ?? section.heading?.[PT_BR] ?? "",
					requirements: [],
					rewards,
					notes: paragraphs.slice(rewards.length ? 1 : 0),
					targets
				}].filter((task) => task.objective || task.rewards.length || task.notes.length || task.targets.length);
			}
		}

		if (Object.keys(tasks).length) result.tasks = tasks;
	}

	const facts = {};
	for (const locale of new Set([
		...Object.keys(section.paragraphs ?? {}),
		...Object.keys(section.items ?? {})
	])) {
		const rows = parseFactRows([...(section.paragraphs?.[locale] ?? []), ...(section.items?.[locale] ?? [])]);
		if (rows.length >= 2) facts[locale] = rows;
	}

	if (Object.keys(facts).length) result.facts = facts;

	if (normalizedId === "informacoes gerais") {
		const profile = {};
		for (const locale of Object.keys(section.paragraphs ?? {})) {
			const paragraphs = section.paragraphs?.[locale] ?? [];
			const structured = parsePokemonProfileText(paragraphs.join(" "));
			if (structured) profile[locale] = structured;
		}

		if (Object.keys(profile).length) result.profile = profile;
	}

	if (normalizedId === "movimentos" || normalizedId.startsWith("movimentos ")) {
		const moves = {};
		for (const locale of Object.keys(section.items ?? {})) {
			const paragraphs = section.paragraphs?.[locale] ?? [];
			const items = section.items?.[locale] ?? [];
			const sectionLabel = section.heading?.[locale] ?? section.heading?.["pt-BR"] ?? "Movimentos";
			const structured = parseMoveGroupsText(paragraphs, items, sectionLabel);
			if (structured.length) moves[locale] = structured;
		}

		if (Object.keys(moves).length) result.moves = moves;
	}

	if (normalizedId === "efetividade" || normalizedId === "efetividades") {
		const effectiveness = {};
		for (const locale of Object.keys(section.paragraphs ?? {})) {
			const paragraphs = section.paragraphs?.[locale] ?? [];
			const structured = parseEffectivenessGroupsText(paragraphs);
			if (structured.length) effectiveness[locale] = structured;
		}

		if (Object.keys(effectiveness).length) result.effectiveness = effectiveness;
	}

	if (normalizedId === "outras versoes") {
		const variants = {};
		for (const locale of new Set([
			...Object.keys(section.paragraphs ?? {}),
			...Object.keys(section.items ?? {})
		])) {
			const entries = [...(section.paragraphs?.[locale] ?? []), ...(section.items?.[locale] ?? [])]
				.map(parseVariantEntryText)
				.filter(Boolean);
			if (entries.length) variants[locale] = dedupeBySlug(entries, (entry) => entry.slug || buildSlug(entry.label, ""));
		}

		if (Object.keys(variants).length) result.variants = variants;
	}

	return result;
}
