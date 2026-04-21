import { PT_BR, buildSlug } from "./shared.mjs";

const REWARD_RARITY_TOKENS = new Set([
	"comum", "raro", "epico", "epica", "lendario", "lendaria", "mitico", "mitica"
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

	return s.trim();
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
	if (/^(facil|normal|dificil|easy|hard|platinum|ultra|hyper|master|grand master|recompensa semanal|recompensa de temporada)$/.test(normalizedRaw)) {
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

		return { type: "loot", name: name || "", difficulty, rarity: lastPart, qty: isQty ? maybeQty : null };
	}

	const name = parts[parts.length - 1] || parts[0] || "";
	return { type: "loot", name, difficulty: null, rarity: null, qty: null };
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

	const normHeading = normalizeIdToken(headingText ?? "");
	if (normHeading === "recompensa" || normHeading === "recompensas" || normHeading === "rewards" || /premios|premiacoes|premios dos baus/.test(normHeading)) {
		return "rewards";
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

	if (!["rewards", "tier", "pokemon-group"].includes(kind)) {
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
			rewards[locale] = propagateDifficulty(parsed);
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
