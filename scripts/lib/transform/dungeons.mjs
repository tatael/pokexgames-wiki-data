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

function splitDenseFactParagraph(value = "") {
	const text = cleanStructuredText(value);
	if (!text) return [];
	if (isMediaFilenameDumpLine(text)) return [];
	const labelRe = /\b(Grupo|Experi[eê]ncia recompensada|Revives?|Tempo limite|Level|N[ií]vel|Dificuldade|Requisitos?)\s*:/giu;
	const matches = [...text.matchAll(labelRe)];
	if (matches.length < 2) return [text];
	return matches
		.map((match, index) => {
			const start = match.index ?? 0;
			const end = matches[index + 1]?.index ?? text.length;
			return cleanStructuredText(text.slice(start, end).replace(/\s+\.$/, "."));
		})
		.filter(Boolean);
}

function isMediaFilenameDumpLine(value = "") {
	const text = cleanStructuredText(value);
	if (!/\.(?:gif|png|jpe?g|webp|svg)\b/i.test(text)) return false;
	const withoutFiles = text
		.replace(/[\p{L}\p{N}_%()' .,&-]+?\.(?:gif|png|jpe?g|webp|svg)\b/giu, " ")
		.replace(/[|,;:()\-–—]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return !withoutFiles;
}

function isRawTableMirrorParagraph(value = "") {
	const source = String(value ?? "");
	const token = cleanStructuredText(source)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	if (!/\.(?:gif|png|jpe?g|webp|svg)\b/i.test(source)) return false;
	if (/^(?:icone|icon)\s+(?:descricao|description)\b/.test(token)) return true;
	if (/^(?:item)\s+(?:custo|cost|raridade|rarity)\b/.test(token)) return true;
	return false;
}

export function isHazardSection(normalizedId, normalizedHeading) {
	return normalizedId === "armadilhas" || normalizedHeading === "armadilhas" || normalizedId === "traps";
}

export function parseHazardEntries(paragraphs = [], items = []) {
	return {
		description: paragraphs
			.map((item) => cleanStructuredText(item))
			.filter((item) => item && !isHazardMirrorParagraph(item) && !isMediaFilenameDumpLine(item)),
		bullets: items.map((item) => cleanStructuredText(item)).filter(Boolean),
	};
}

function isHazardMirrorParagraph(value = "") {
	const token = cleanStructuredText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	return /^armadilhas\s*:\s*dano causado/.test(token)
		|| (/trap\d*\.gif/i.test(value) && /vida maxima|vida máxima|hit/i.test(value));
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
	const intro = [];
	const factBullets = [];
	for (const paragraph of paragraphs ?? []) {
		if (isRawTableMirrorParagraph(paragraph)) continue;
		const parts = splitDenseFactParagraph(paragraph);
		if (parts.length > 1) factBullets.push(...parts);
		else intro.push(...parts);
	}

	return {
		type,
		intro,
		bullets: [
			...factBullets,
			...(items ?? [])
			.filter((item) => !String(item ?? "").includes("|"))
			.map(cleanStructuredText)
			.filter((item) => !isMediaFilenameDumpLine(item))
			.filter(Boolean),
		],
		rows: parsePipeRows(items).map((cells) => ({
			cells: cells.map((text) => ({ text })),
		})),
	};
}
