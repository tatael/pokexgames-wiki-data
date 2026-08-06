// Boss Fight "Pokémon recomendados" sections are one <h3> per role (Tanque, Causador de
// Dano, Suporte Contínuo), each followed by a wikitable whose cells are a sprite plus a
// linked Pokémon name.
//
// The generic extractor flattens all of that into one undifferentiated list, which ends
// up publishing every role's Pokémon under every role and stray prose as a Pokémon name.
// Reading the headings and their tables directly keeps each roster with its own role.

const ROLE_HEADING_RE = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;

function decodeEntities(value) {
	return String(value ?? "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
	return decodeEntities(String(value ?? "").replace(/<[^>]*>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

// The section heading is "<img alt="Interface Tank PVE.png"> Tanque"; only the text after
// the icon is the role name.
function headingLabel(html) {
	return stripTags(String(html ?? "").replace(/<img[^>]*>/gi, " "));
}

function sliceRecommendationsSection(html) {
	const source = String(html ?? "");
	const start = source.search(/id="Pok[^"]*recomendados"/i);
	if (start < 0) return "";
	const rest = source.slice(start);
	const end = rest.search(/<h2[\s>]/i);
	return end > 0 ? rest.slice(0, end) : rest;
}

// A roster cell links the Pokémon page: <a href="/index.php/Big_Onix" title="Big Onix">.
// The title attribute is the canonical name, so nested sprite links collapse cleanly.
function pokemonNamesFromTable(tableHtml) {
	const names = [];
	for (const cell of String(tableHtml ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)) {
		const titles = [...cell[1].matchAll(/<a[^>]*title="([^"]+)"/gi)].map((match) => decodeEntities(match[1]).trim());
		const name = titles.find(Boolean) || stripTags(cell[1]);
		if (!name) continue;
		// A cell holding only an image filename is a sprite with no link; skip it.
		if (/\.(?:png|gif|webp|jpe?g|svg)$/i.test(name)) continue;
		if (!names.includes(name)) names.push(name);
	}

	return names;
}

function firstTable(html) {
	return String(html ?? "").match(/<table[^>]*>[\s\S]*?<\/table>/i)?.[0] ?? "";
}

// Returns { intro: [...], groups: [{ label, pokemon: [...] }] } — the shape
// `renderBossRecommendationsCard` consumes, with `pokemon` holding actual names.
export function extractBossRecommendations(html) {
	const section = sliceRecommendationsSection(html);
	if (!section) return null;

	const headings = [...section.matchAll(ROLE_HEADING_RE)];
	if (!headings.length) return null;

	const intro = [];
	for (const paragraph of section.slice(0, headings[0].index).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
		const text = stripTags(paragraph[1]);
		if (text) intro.push(text);
	}

	const groups = [];
	for (const [index, heading] of headings.entries()) {
		const label = headingLabel(heading[1]);
		if (!label) continue;
		const bodyStart = heading.index + heading[0].length;
		const bodyEnd = index + 1 < headings.length ? headings[index + 1].index : section.length;
		const body = section.slice(bodyStart, bodyEnd);
		const pokemon = pokemonNamesFromTable(firstTable(body));
		if (!pokemon.length) continue;

		// Prose between the heading and its table is a note about that role.
		const notes = [];
		const beforeTable = body.slice(0, body.search(/<table[\s>]/i) < 0 ? body.length : body.search(/<table[\s>]/i));
		for (const paragraph of beforeTable.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
			const text = stripTags(paragraph[1]);
			if (text) notes.push(text);
		}

		groups.push({ label, pokemon, ...(notes.length ? { notes } : {}) });
	}

	if (!groups.length) return null;
	return { intro, groups };
}
