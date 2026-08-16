// Post-deploy check. Proves the bundle that is actually reachable over HTTPS is the one we
// just built — not the one Pages was already serving.
//
// This exists because the pipeline spent four months "succeeding" at re-publishing an April
// bundle. Checking dist/ locally would not have caught a single day of it.

import path from "node:path";
import { readFile } from "node:fs/promises";

import { DIST_DIR, SCHEMA_VERSION } from "./lib/shared.mjs";
import { pageUrlPath } from "./lib/publish-guard.mjs";

const PUBLISHED_BASE_URL =
	process.env.WIKI_PUBLISHED_BASE_URL?.trim() || "https://tatael.github.io/pokexgames-wiki-data";
const FETCH_TIMEOUT_MS = 30000;
const RETRIES = 5;
const RETRY_DELAY_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const baseUrl = () => PUBLISHED_BASE_URL.replace(/\/+$/, "");

async function fetchPublished(relativePath, { json = true } = {}) {
	const url = `${baseUrl()}/${relativePath.replace(/^\/+/, "")}`;
	let lastError = null;

	// A Pages deploy is not readable the instant the workflow step returns; the CDN needs a
	// moment. Retrying here keeps a slow propagation from reading as a failed publish.
	for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
		try {
			const response = await fetch(url, {
				cache: "no-store",
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return json ? await response.json() : await response.text();
		} catch (error) {
			lastError = error;
			if (attempt < RETRIES) {
				console.warn(`${url} not ready (${error.message}); retrying in ${RETRY_DELAY_MS / 1000}s.`);
				await sleep(RETRY_DELAY_MS);
			}
		}
	}

	throw new Error(`${url} never became readable: ${lastError?.message ?? "unknown error"}`);
}

/**
 * Waits for the CDN to actually serve the bundle we just built.
 *
 * `fetchPublished` retries transport failures, but a stale bundle answers 200 — the manifest is
 * perfectly reachable, it is simply the previous deploy. Comparing once and failing was wrong: a
 * Pages deploy propagates asynchronously, so the first read after the deploy step returns can
 * legitimately still be the old bundle. Only after the freshness window expires is this a real
 * publish failure rather than a slow one.
 */
async function waitForPublishedManifest(expectedUpdatedAt) {
	let published = await fetchPublished("manifest.json");

	for (let attempt = 1; attempt <= RETRIES && published.updatedAt !== expectedUpdatedAt; attempt += 1) {
		console.warn(
			`Published bundle is still ${published.updatedAt}, waiting for ${expectedUpdatedAt}; retrying in ${RETRY_DELAY_MS / 1000}s.`,
		);
		await sleep(RETRY_DELAY_MS);
		published = await fetchPublished("manifest.json");
	}

	return published;
}

async function main() {
	const built = JSON.parse(await readFile(path.join(DIST_DIR, "manifest.json"), "utf8"));
	const published = await waitForPublishedManifest(built.updatedAt);

	const failures = [];

	if (published.schemaVersion !== SCHEMA_VERSION) {
		failures.push(`published schemaVersion is ${published.schemaVersion}, expected ${SCHEMA_VERSION}`);
	}

	if (published.updatedAt !== built.updatedAt) {
		failures.push(
			`published updatedAt is ${published.updatedAt}, expected ${built.updatedAt} — Pages never served the new bundle`,
		);
	}

	const publishedPages = (published.pages ?? []).length;
	const builtPages = (built.pages ?? []).length;
	if (publishedPages !== builtPages) {
		failures.push(`published ${publishedPages} pages, built ${builtPages}`);
	}

	// Assets sit at the bundle root, pages sit under pages/. The overlay encodes the same
	// asymmetry in src-tauri/src/wiki/http.rs — `media_remote_url` joins the path directly while
	// `page_remote_url` inserts `pages/`. Getting this wrong here 404s on a bundle that is fine.
	if (published.searchIndexPath) {
		await fetchPublished(published.searchIndexPath);
	} else {
		failures.push("published manifest declares no searchIndexPath");
	}

	// One real page, end to end. The manifest can be perfect while every page 404s.
	const samplePage = (published.pages ?? []).find((page) => page?.pagePath);
	if (samplePage) {
		await fetchPublished(pageUrlPath(samplePage.pagePath));
	} else {
		failures.push("published manifest has no page with a pagePath to sample");
	}

	if (failures.length > 0) {
		for (const failure of failures) console.error(`SMOKE FAILED: ${failure}`);
		throw new Error("the published bundle is not the bundle that was just built");
	}

	console.log(
		`Smoke passed: ${baseUrl()} serves schemaVersion ${published.schemaVersion}, ${publishedPages} pages, updated ${published.updatedAt}.`,
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
