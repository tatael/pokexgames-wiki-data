// Clan "Efetividades" sections are wikitables whose first header row carries the
// element icon plus the mode ("Steel Ofensivo"), and whose damage column uses rowspan
// so a multiplier covers several element rows.
//
// The generic section extractor drops that header row and flattens the rowspans, which
// leaves the transform with rows like "Ice | Ice" that no longer say which multiplier,
// element or mode they belong to. Parsing the table HTML directly keeps all three.

const ELEMENT_NAMES = new Set([
	"Normal", "Fire", "Water", "Grass", "Electric", "Ice", "Fighting", "Poison", "Ground",
	"Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy", "Crystal",
]);

const MULTIPLIER_RE = /^(2x|0\.5x|0x)$/i;

function decodeEntities(value) {
	return String(value ?? "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(value) {
	return decodeEntities(String(value ?? "").replace(/<[^>]*>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

function elementFromImages(html) {
	for (const match of String(html ?? "").matchAll(/alt="([^"]+)\.png"/gi)) {
		const name = match[1].replace(/\d+$/, "").trim();
		if (ELEMENT_NAMES.has(name)) return name;
	}

	return "";
}

function sliceEffectivenessSection(html) {
	const source = String(html ?? "");
	const start = source.search(/id="Efetividades?"/i);
	if (start < 0) return "";
	// Stop at the next top-level heading so neighbouring tables are not picked up.
	const rest = source.slice(start);
	const end = rest.search(/<h1[\s>]/i);
	return end > 0 ? rest.slice(0, end) : rest;
}

function parseRows(tableHtml) {
	return [...String(tableHtml ?? "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
}

function parseCells(rowHtml) {
	return [...String(rowHtml ?? "").matchAll(/<(t[dh])([^>]*)>([\s\S]*?)<\/\1>/gi)].map((match) => ({
		tag: match[1].toLowerCase(),
		attrs: match[2] ?? "",
		html: match[3] ?? "",
		text: stripTags(match[3]),
	}));
}

// Returns [{ label: "<Element> <Ofensivo|Defensivo> <2x|0.5x|0x>", values: [element…] }]
// which is the shape `renderEffectivenessCard` parses back apart.
export function extractClanEffectivenessGroups(html) {
	const section = sliceEffectivenessSection(html);
	if (!section) return [];

	const groups = [];
	const seen = new Set();

	for (const tableMatch of section.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
		const rows = parseRows(tableMatch[1]);
		let element = "";
		let mode = "";
		let multiplier = "";
		let values = [];

		const flush = () => {
			if (!element || !mode || !multiplier || !values.length) return;
			const label = `${element} ${mode} ${multiplier}`;
			const key = `${label}:${values.join("|")}`;
			if (!seen.has(key)) {
				seen.add(key);
				groups.push({ label, values: [...values] });
			}
			values = [];
		};

		for (const row of rows) {
			const cells = parseCells(row);
			if (!cells.length) continue;

			// Title row: "<icon> Ofensivo" / "<icon> Defensivo".
			const modeMatch = cells.map((cell) => cell.text).join(" ").match(/\b(Ofensivo|Defensivo)\b/i);
			if (cells.every((cell) => cell.tag === "th") && modeMatch) {
				flush();
				const found = elementFromImages(row);
				if (found) element = found;
				mode = modeMatch[1].replace(/^./, (c) => c.toUpperCase()).toLowerCase() === "ofensivo" ? "Ofensivo" : "Defensivo";
				multiplier = "";
				continue;
			}

			// Column header row ("Dano | Elemento") carries no data.
			if (cells.every((cell) => cell.tag === "th")) continue;

			const first = cells[0];
			let elementCells = cells;
			if (MULTIPLIER_RE.test(first.text)) {
				flush();
				multiplier = first.text.toLowerCase();
				elementCells = cells.slice(1);
			}

			if (!multiplier) continue;
			// Prefer the row's element icon over its label. They agree on every row except
			// where the source wiki mislabels one (Ironhard's Steel table pairs a Bug icon
			// with the text "Fighting"), and the icon is the reliable side.
			const iconName = elementFromImages(elementCells.map((cell) => cell.html).join(" "));
			const labelName = stripTags(elementCells[elementCells.length - 1]?.text ?? "");
			const name = iconName || labelName;
			// "-" marks an empty group, e.g. a 0x row with no elements.
			if (!name || name === "-") continue;
			if (ELEMENT_NAMES.has(name) && !values.includes(name)) values.push(name);
		}

		flush();
	}

	return groups;
}
