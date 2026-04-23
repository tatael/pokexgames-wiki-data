import { buildSlug } from "../shared.mjs";
import { cleanStructuredText, dedupeBySlug, displayStructuredText, stripImageRefFromText } from "./text.mjs";

const FACT_LABEL_RE = /(Nome|Level|Elemento|Habilidades?|Boost|Materia)\s*:/gi;
const FACT_LINE_RE = /^([^:]{2,36}):\s*(.+)$/;
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

export function parsePokemonProfileText(text) {
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

export function parseFactRows(values = []) {
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

export function parseMoveGroupsText(paragraphs = [], items = [], sectionLabel = "Movimentos") {
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

export function parseEffectivenessGroupsText(paragraphs = []) {
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

export function parseVariantEntryText(raw) {
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

export function cleanRawPokemonReferenceItems(itemsByLocale = {}) {
	const cleaned = {};
	for (const locale of Object.keys(itemsByLocale ?? {})) {
		cleaned[locale] = (itemsByLocale[locale] ?? [])
			.filter((item) => !looksLikeRawPokemonReferenceText(item));
	}

	return cleaned;
}
