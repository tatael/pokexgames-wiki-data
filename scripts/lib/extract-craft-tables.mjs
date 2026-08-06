// Craft recipes that still live in an HTML wikitable ("Alquimista", "Crafts de
// Cozinheiro") rather than in the `window.CraftProfData` widget.
//
// The generic section extractor flattens those tables: the Cozinheiro table loses its
// cell boundaries entirely (every `<br>` segment becomes its own loose line), and the
// Alquimista table survives as commerce rows but never reaches `parseCraftEntries`,
// which reads `section.items` — empty by the time commerce has consumed them. Either
// way the page ends up in the Calculadoras list with no calculator on it.
//
// Parsing the table HTML directly is both more robust and more accurate than the pipe
// path: `<br>` already separates one ingredient from the next, so amounts and names pair
// up exactly instead of being recovered by scanning for numbers in a run-on string.

const TABLE_RE = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<(t[dh])\b[^>]*>([\s\S]*?)<\/\1>/gi;

const RESULT_HEADERS = ["item", "itens", "comida", "comidas", "produto", "produtos", "receita"];
const SKILL_HEADERS = ["habilidade", "skill"];
const MATERIAL_HEADERS = ["material", "materiais", "ingrediente", "ingredientes"];
const DURATION_HEADERS = ["tempo de espera", "tempo", "duracao"];
const STATION_HEADERS = ["pode ser feito em", "local", "estacao", "workshop"];

function normalize(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

function decodeEntities(value) {
	return String(value ?? "")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#0?39;|&apos;/gi, "'");
}

function plainText(html) {
	return decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

// One cell is a list when it uses `<br>` as a separator, which is how the wiki stacks
// several ingredients or several crafting stations inside a single `<td>`.
function cellSegments(html) {
	return String(html ?? "")
		.split(/<br\s*\/?>/i)
		.map((segment) => plainText(segment))
		.filter(Boolean);
}

function rowCells(rowHtml) {
	return [...String(rowHtml ?? "").matchAll(CELL_RE)].map((match) => match[2]);
}

function headerIndex(headers, candidates) {
	return headers.findIndex((header) => candidates.some((candidate) => header === candidate || header.startsWith(candidate)));
}

function parseQuantity(text) {
	const match = String(text ?? "").match(/\((\d+)\s*x\)\s*$/i);
	return {
		quantity: match ? Number(match[1]) : 1,
		name: String(text ?? "").replace(/\s*\(\d+\s*x\)\s*$/i, "").trim(),
	};
}

// A result cell is an icon plus the item name; the icon's alt text repeats the name, so
// the plain text of the cell reads "Mc Torchic.png MC Torchic". Dropping any leading
// token that ends in an image extension leaves just the name.
function stripLeadingFilenames(text) {
	return String(text ?? "")
		.replace(/\b[\w%()'&,+-]+\.(?:png|gif|jpe?g|webp|svg)\b/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function parseIngredient(segment) {
	const text = stripLeadingFilenames(segment);
	const match = text.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
	if (!match) return null;
	const amount = Number(match[1].replace(",", "."));
	const name = match[2].trim();
	if (!Number.isFinite(amount) || amount <= 0 || !name) return null;
	return { name, amount };
}

function parseRow(cells, columns) {
	const resultText = stripLeadingFilenames(plainText(cells[columns.result] ?? ""));
	const { name, quantity } = parseQuantity(resultText);
	if (!name) return null;

	const ingredients = cellSegments(cells[columns.materials] ?? "")
		.map(parseIngredient)
		.filter(Boolean);
	if (!ingredients.length) return null;

	const skillMatch = plainText(cells[columns.skill] ?? "").match(/\d+/);
	const entry = {
		result: { name, quantity },
		skill: skillMatch ? Number(skillMatch[0]) : null,
		duration: columns.duration >= 0 ? plainText(cells[columns.duration] ?? "") : "",
		ingredients,
	};

	if (columns.station >= 0) {
		const stations = cellSegments(cells[columns.station] ?? "")
			.map((segment) => stripLeadingFilenames(segment))
			.filter(Boolean);
		if (stations.length) entry.station = stations.join(" / ");
	}

	return entry;
}

// Returns every craft recipe found in the page's craft wikitables, or an empty array
// when the page has none.
export function extractCraftTableEntries(html) {
	const source = String(html ?? "");
	const entries = [];

	for (const tableMatch of source.matchAll(TABLE_RE)) {
		const rows = [...tableMatch[1].matchAll(ROW_RE)].map((match) => match[1]);
		if (rows.length < 2) continue;

		const headers = rowCells(rows[0]).map((cell) => normalize(plainText(cell)));
		const columns = {
			result: headerIndex(headers, RESULT_HEADERS),
			skill: headerIndex(headers, SKILL_HEADERS),
			materials: headerIndex(headers, MATERIAL_HEADERS),
			duration: headerIndex(headers, DURATION_HEADERS),
			station: headerIndex(headers, STATION_HEADERS),
		};
		// Result + skill + materials is what makes a table a recipe list; without all three
		// this is some other wikitable that happens to mention items.
		if (columns.result < 0 || columns.skill < 0 || columns.materials < 0) continue;

		for (const rowHtml of rows.slice(1)) {
			const cells = rowCells(rowHtml);
			if (cells.length <= columns.materials) continue;
			const entry = parseRow(cells, columns);
			if (entry) entries.push(entry);
		}
	}

	return entries;
}
