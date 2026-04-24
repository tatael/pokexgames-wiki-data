import { cleanStructuredText } from "./text.mjs";

export function isHazardSection(normalizedId, normalizedHeading) {
	return normalizedId === "armadilhas" || normalizedHeading === "armadilhas" || normalizedId === "traps";
}

export function parseHazardEntries(paragraphs = [], items = []) {
	return {
		description: paragraphs.map((item) => cleanStructuredText(item)).filter(Boolean),
		bullets: items.map((item) => cleanStructuredText(item)).filter(Boolean),
	};
}
