import { cleanStructuredText } from "./text.mjs";

function parsePipeRows(items = []) {
	return (items ?? [])
		.filter((item) => String(item ?? "").includes("|"))
		.map((item) => String(item ?? "")
			.split(/\s*\|\s*/)
			.map((part) => cleanStructuredText(part))
			.filter(Boolean))
		.filter((cells) => cells.length >= 2);
}

export function isHazardSection(normalizedId, normalizedHeading) {
	return normalizedId === "armadilhas" || normalizedHeading === "armadilhas" || normalizedId === "traps";
}

export function parseHazardEntries(paragraphs = [], items = []) {
	return {
		description: paragraphs.map((item) => cleanStructuredText(item)).filter(Boolean),
		bullets: items.map((item) => cleanStructuredText(item)).filter(Boolean),
	};
}

export function isDungeonSupportSection(normalizedId, normalizedHeading, pageCategory) {
	if (![
		"dimensional zone",
		"events",
		"held items",
		"items",
		"mystery dungeons",
		"nightmare world",
		"professions",
		"secret lab",
		"systems",
		"territory guardians",
		"ultra lab",
	].includes(pageCategory)) return false;
	const token = `${normalizedId} ${normalizedHeading}`;
	return /\b(dungeon|dungeons|masmorra|masmorras|rift|rifts|progress|progresso|progressao|rotacao|rotation|mecanica|mecanicas|acesso|requisitos?|informacoes?|observacoes?|dicas?|funcionamento|como funciona|mapa|location|localizacao|introducao|introduction|overview|sobre|guia|guide|tutorial|becoming|tornando|convertirse|first steps|primeiros passos|primeros pasos|coleta|collecting resources|colecta|recursos|profit|lucro|ganancia|ganho|exclusividade|exclusivity|lockpick|item finder|turrets?|banners?|pontuacao|pontos|points|perfil|profile|customiz|participando|trocando|adquirindo|colocando)\b/.test(token);
}

export function parseDungeonSupport(normalizedId, normalizedHeading, paragraphs = [], items = []) {
	const token = `${normalizedId} ${normalizedHeading}`;
	const type = /\b(acesso|requisitos?)\b/.test(token)
		? "access"
		: /\b(progress|progresso|progressao)\b/.test(token)
			? "progression"
			: /\b(rotation|rotacao)\b/.test(token)
				? "rotation"
				: /\b(mecanica|mecanicas)\b/.test(token)
					? "mechanics"
					: "overview";

	return {
		type,
		intro: (paragraphs ?? []).map(cleanStructuredText).filter(Boolean),
		bullets: (items ?? [])
			.filter((item) => !String(item ?? "").includes("|"))
			.map(cleanStructuredText)
			.filter(Boolean),
		rows: parsePipeRows(items).map((cells) => ({
			cells: cells.map((text) => ({ text })),
		})),
	};
}
