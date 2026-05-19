import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { HTML_CACHE_DIR, WIKI_FETCH_CACHE_HOURS } from "./lib/shared.mjs";

const maxAgeMs = WIKI_FETCH_CACHE_HOURS * 60 * 60 * 1000;
const now = Date.now();
let removed = 0;
let errors = 0;

let entries;
try {
	entries = await readdir(HTML_CACHE_DIR);
} catch {
	console.log("Cache directory does not exist or is empty — nothing to clean.");
	process.exit(0);
}

for (const name of entries) {
	const filePath = path.join(HTML_CACHE_DIR, name);
	try {
		const info = await stat(filePath);
		if (!info.isFile()) continue;
		if (now - info.mtimeMs >= maxAgeMs) {
			await rm(filePath);
			removed += 1;
		}
	} catch (error) {
		console.warn(`Failed to process ${filePath}: ${error instanceof Error ? error.message : error}`);
		errors += 1;
	}
}

console.log(`Cache clean: removed ${removed} file(s) older than ${WIKI_FETCH_CACHE_HOURS}h.${errors ? ` (${errors} error(s))` : ""}`);
