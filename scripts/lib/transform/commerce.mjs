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

export function isCommerceSection(normalizedId, normalizedHeading, pageKind = "") {
	const token = `${normalizedId} ${normalizedHeading} ${pageKind}`;
	return /\b(exchange|troca|trocando|shop|loja|mercado|craft|crafts|custo|custos|cost|costs|preco|precos|price|prices|recompensa|recompensas|profit|lucro|ganancia|ganho|pontuacao|pontos|points|ticket|tokens?|jewels?|joia|joias|slot)\b/.test(token);
}

export function parseCommerceEntries(normalizedId, normalizedHeading, pageKind = "", paragraphs = [], items = []) {
	const token = `${normalizedId} ${normalizedHeading} ${pageKind}`;
	const type = /\b(exchange|troca)\b/.test(token)
		? "exchange"
		: /\b(shop|loja)\b/.test(token)
			? "shop"
			: /\b(craft|crafts)\b/.test(token)
				? "craft"
				: /\b(custo|custos|cost|costs|preco|precos|price|prices|profit|lucro|ganancia|ganho|pontuacao|pontos|points)\b/.test(token)
					? "cost"
					: "generic";

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
