import path from "node:path";
import { readJson, writeJson, DIST_BUILD_DIR } from "./lib/shared.mjs";
import { extractQuestMetadata } from "./lib/transform/quest-metadata.mjs";
import { readdir } from "node:fs/promises";

async function walkJson(dir, out = []) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			await walkJson(full, out);
		} else if (entry.isFile() && entry.name.endsWith(".json")) {
			out.push(full);
		}
	}
	return out;
}

async function main() {
	const distRoot = path.resolve("dist");
	const pagesRoot = path.join(distRoot, "pages");
	const manifestPath = path.join(distRoot, "manifest.json");

	const manifest = await readJson(manifestPath);
	const indexBySlug = new Map((manifest.pages ?? []).map((entry) => [entry.slug, entry]));

	const files = await walkJson(pagesRoot);
	let touched = 0;
	for (const file of files) {
		const page = await readJson(file);
		if (page?.category !== "quests") continue;
		const navigationPath = indexBySlug.get(page.slug)?.navigationPath ?? [];
		const metadata = extractQuestMetadata({ sections: page.sections ?? [], navigationPath });
		if (!metadata) continue;
		page.questMetadata = metadata;
		await writeJson(file, page);
		const entry = indexBySlug.get(page.slug);
		if (entry) entry.questMetadata = metadata;
		touched += 1;
	}
	await writeJson(manifestPath, manifest);
	console.log(`Patched ${touched} quest pages and manifest entries.`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
