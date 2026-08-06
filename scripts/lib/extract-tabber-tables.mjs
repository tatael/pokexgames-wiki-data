// MediaWiki `tabber` widgets hold one <article class="tabber__panel" data-title="Tier 1">
// per tab, each wrapping its own table. The generic section extractor flattens all the
// panels together and keeps only the header line, so a per-tier table publishes as a
// single "Faixa de Nível | Boost" row with no data behind it.
//
// Reading the panels straight from the HTML keeps each tab's title with its own rows.

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

function tableRows(tableHtml) {
	return [...String(tableHtml ?? "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
		.map((row) => [...row[1].matchAll(/<(t[dh])[^>]*>([\s\S]*?)<\/\1>/gi)].map((cell) => stripTags(cell[2])))
		.filter((cells) => cells.length);
}

// Slices the document from a heading id up to the next heading of the same or higher
// level, so only that section's tabber is read.
export function sliceSectionByHeadingId(html, headingIdPattern) {
	const source = String(html ?? "");
	const start = source.search(headingIdPattern);
	if (start < 0) return "";
	const rest = source.slice(start);
	const end = rest.search(/<h[12][\s>]/i);
	return end > 0 ? rest.slice(0, end) : rest;
}

// Returns [{ title, rows: [[cell, …], …] }] for every tab in the section's tabber.
export function extractTabberTables(html) {
	const source = String(html ?? "");
	const panels = [...source.matchAll(/<article[^>]*class="[^"]*tabber__panel[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)];
	const out = [];

	for (const panel of panels) {
		const attrs = panel[0].slice(0, panel[0].indexOf(">"));
		const title = decodeEntities(attrs.match(/data-title="([^"]*)"/i)?.[1] ?? "").trim();
		const table = panel[1].match(/<table[^>]*>[\s\S]*?<\/table>/i)?.[0] ?? "";
		if (!table) continue;
		const rows = tableRows(table);
		if (rows.length < 2) continue;
		out.push({ title, rows });
	}

	return out;
}

// Shapes the X-Boost tabber into the `heldBoosts.ranges` payload: one entry per tier,
// each with its own level-range rows.
export function extractHeldBoostRanges(html) {
	const section = sliceSectionByHeadingId(html, /id="Informa[^"]*X-Boost"/i);
	if (!section) return [];

	const ranges = [];
	for (const [index, panel] of extractTabberTables(section).entries()) {
		const [header, ...body] = panel.rows;
		// The header must actually name the two columns, otherwise this is a different table.
		if (!/faixa de n[íi]vel|level range/i.test(header.join(" "))) continue;
		const rows = body
			.filter((cells) => cells.length >= 2 && cells[0] && cells[1])
			.map((cells) => ({ levelRange: cells[0], boost: cells[1] }));
		if (!rows.length) continue;
		ranges.push({ name: panel.title || `Tier ${index + 1}`, rows });
	}

	return ranges;
}
