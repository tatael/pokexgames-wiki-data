import { normalizeIdToken } from "./text.mjs";

export const SECTION_KIND_BY_ID = {
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
	"rewards": "rewards",
};

export function isTierSectionToken(value) {
	const token = normalizeIdToken(value ?? "");
	if (!token) return false;
	const compact = token.replace(/\s+/g, "");
	return /^(?:bronze|silver|gold|platinum|diamond|master)$/.test(token)
		|| /^tier\d+[a-z]?h?$/.test(compact)
		|| /^t\d+[a-z]?h?$/.test(compact)
		|| /^[sabcdr]$/.test(compact);
}

export function classifySectionKind(id, headingText) {
	const normId = normalizeIdToken(id);
	if (isTierSectionToken(normId)) {
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

	if (isTierSectionToken(normHeading)) {
		return "tier";
	}

	return SECTION_KIND_BY_ID[id] ?? "prose";
}
