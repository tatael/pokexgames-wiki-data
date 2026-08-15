// Pre-deploy gate. Runs after `npm run build` and `npm run validate`, before the bundle is
// uploaded to Pages. Blocks a publish that would shrink the live bundle.
//
// Set WIKI_PUBLISH_FORCE=1 to publish anyway — for the case where the wiki really did lose
// content and the smaller bundle is correct.

import path from "node:path";
import { readFile, access } from "node:fs/promises";

import { DIST_DIR } from "./lib/shared.mjs";
import { evaluatePublishGuard, summarizeBundle } from "./lib/publish-guard.mjs";

const PUBLISHED_BASE_URL =
	process.env.WIKI_PUBLISHED_BASE_URL?.trim() || "https://tatael.github.io/pokexgames-wiki-data";
const FETCH_TIMEOUT_MS = 30000;

function isForced() {
	const value = process.env.WIKI_PUBLISH_FORCE?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes";
}

async function readBuiltManifest() {
	const manifestPath = path.join(DIST_DIR, "manifest.json");
	try {
		return JSON.parse(await readFile(manifestPath, "utf8"));
	} catch (error) {
		throw new Error(
			`no built bundle at ${manifestPath}. The build step did not produce dist/ — check the sync output above. (${error.message})`,
		);
	}
}

async function assertSearchIndexPresent(manifest) {
	const relative = manifest?.searchIndexPath;
	if (!relative) {
		throw new Error("built manifest declares no searchIndexPath; the overlay's search would fall back to summaries");
	}

	const indexPath = path.join(DIST_DIR, relative);
	try {
		await access(indexPath);
	} catch {
		throw new Error(`manifest points at ${relative} but ${indexPath} does not exist`);
	}
}

// A missing baseline is not a failure: Pages may be empty, mid-deploy, or briefly 5xx.
// The guard treats "unknown" as "cannot regress" and says so loudly.
async function readPublishedManifest() {
	const url = `${PUBLISHED_BASE_URL.replace(/\/+$/, "")}/manifest.json`;
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!response.ok) {
			console.warn(`Published manifest returned HTTP ${response.status}; treating as no baseline.`);
			return null;
		}

		return await response.json();
	} catch (error) {
		console.warn(`Could not read published manifest (${error.message}); treating as no baseline.`);
		return null;
	}
}

async function main() {
	const builtManifest = await readBuiltManifest();
	await assertSearchIndexPresent(builtManifest);

	const built = summarizeBundle(builtManifest);
	const publishedManifest = await readPublishedManifest();
	const live = publishedManifest ? summarizeBundle(publishedManifest) : null;

	console.log(
		`Built: schemaVersion ${built.schemaVersion}, ${built.pageCount} pages, ${built.categories.size} categories.`,
	);
	if (live) {
		console.log(
			`Live:  schemaVersion ${live.schemaVersion}, ${live.pageCount} pages, ${live.categories.size} categories.`,
		);
	}

	const result = evaluatePublishGuard({ built, live, force: isForced() });
	for (const warning of result.warnings) console.warn(`WARN: ${warning}`);

	if (!result.ok) {
		for (const reason of result.blocking) console.error(`BLOCKED: ${reason}`);
		throw new Error(
			"refusing to publish a bundle that regresses the live one. Set WIKI_PUBLISH_FORCE=1 if the shrink is correct.",
		);
	}

	console.log("Publish guard passed.");
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
