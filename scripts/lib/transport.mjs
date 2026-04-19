import http from "node:http";
import https from "node:https";

import { WIKI_FETCH_RETRY_ATTEMPTS, WIKI_FETCH_TIMEOUT_MS } from "./shared.mjs";

const USER_AGENT = "pokexgames-wiki-data/0.1 (+https://github.com/tatael/pokexgames-wiki-data)";
const _fetchCache = new Map();
const _jsonCache = new Map();

function decodeHtmlBytes(bytes, contentType = "") {
	const headerCharsetMatch = contentType.match(/charset=([^;]+)/i);
	const headSnippet = new TextDecoder("utf-8").decode(bytes.slice(0, 2048));
	const metaCharsetMatch = headSnippet.match(/<meta[^>]+charset=["']?([^"'>\s]+)/i);
	const charset = (headerCharsetMatch?.[1] || metaCharsetMatch?.[1] || "utf-8").trim().toLowerCase();

	try {
		return new TextDecoder(charset).decode(bytes);
	} catch {
		return new TextDecoder("latin1").decode(bytes);
	}
}

function requestUrlRaw(url, redirectsRemaining = 5) {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const transport = parsed.protocol === "http:" ? http : https;
		const request = transport.request(
			parsed,
			{
				method: "GET",
				headers: {
					"User-Agent": USER_AGENT,
					"Accept-Encoding": "identity"
				},
				timeout: WIKI_FETCH_TIMEOUT_MS
			},
			(response) => {
				const status = response.statusCode ?? 0;
				if ([301, 302, 303, 307, 308].includes(status)) {
					const location = response.headers.location;
					response.resume();
					if (!location) {
						reject(new Error(`redirect without location (HTTP ${status})`));
						return;
					}
					if (redirectsRemaining <= 0) {
						reject(new Error("too many redirects"));
						return;
					}

					const nextUrl = new URL(location, parsed).toString();
					resolve(requestUrlRaw(nextUrl, redirectsRemaining - 1));
					return;
				}

				if (status === 404) {
					response.resume();
					resolve(null);
					return;
				}

				if (status < 200 || status >= 300) {
					response.resume();
					reject(new Error(`HTTP ${status}`));
					return;
				}

				const chunks = [];
				response.on("data", (chunk) => chunks.push(chunk));
				response.on("end", () => {
					const bytes = Buffer.concat(chunks);
					resolve({
						bytes: new Uint8Array(bytes),
						contentType: String(response.headers["content-type"] || "")
					});
				});
			}
		);

		request.on("timeout", () => request.destroy(new Error("request timeout")));
		request.on("error", reject);
		request.end();
	});
}

async function fetchWikiHtmlWithHttpFallback(url) {
	const result = await requestUrlRaw(url);
	if (result === null) return null;
	return decodeHtmlBytes(result.bytes, result.contentType);
}

async function _fetchWikiHtml(url) {
	let lastError = null;

	for (let attempt = 1; attempt <= WIKI_FETCH_RETRY_ATTEMPTS; attempt += 1) {
		try {
			const response = await fetch(url, {
				headers: {
					"User-Agent": USER_AGENT
				},
				signal: AbortSignal.timeout(WIKI_FETCH_TIMEOUT_MS)
			});

			if (response.status === 404) {
				return null;
			}

			if (!response.ok) {
				throw new Error(`failed to fetch ${url}: HTTP ${response.status}`);
			}

			const bytes = new Uint8Array(await response.arrayBuffer());
			const contentType = response.headers.get("content-type") || "";
			return decodeHtmlBytes(bytes, contentType);
		} catch (error) {
			lastError = error;
			try {
				return await fetchWikiHtmlWithHttpFallback(url);
			} catch (fallbackError) {
				lastError = fallbackError;
			}
			if (attempt < WIKI_FETCH_RETRY_ATTEMPTS) {
				await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
			}
		}
	}

	throw lastError instanceof Error
		? new Error(`failed to fetch ${url}: ${lastError.message}`)
		: new Error(`failed to fetch ${url}`);
}

export function fetchWikiHtml(url) {
	if (_fetchCache.has(url)) {
		return _fetchCache.get(url);
	}

	const promise = _fetchWikiHtml(url);
	_fetchCache.set(url, promise);
	return promise;
}

async function _fetchJson(url) {
	let lastError = null;

	for (let attempt = 1; attempt <= WIKI_FETCH_RETRY_ATTEMPTS; attempt += 1) {
		try {
			const response = await fetch(url, {
				headers: {
					"User-Agent": USER_AGENT
				},
				signal: AbortSignal.timeout(WIKI_FETCH_TIMEOUT_MS)
			});

			if (!response.ok) {
				throw new Error(`failed to fetch ${url}: HTTP ${response.status}`);
			}

			return await response.json();
		} catch (error) {
			lastError = error;
			if (attempt < WIKI_FETCH_RETRY_ATTEMPTS) {
				await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
			}
		}
	}

	throw lastError instanceof Error
		? new Error(`failed to fetch ${url}: ${lastError.message}`)
		: new Error(`failed to fetch ${url}`);
}

export function fetchJson(url) {
	if (_jsonCache.has(url)) {
		return _jsonCache.get(url);
	}

	const promise = _fetchJson(url);
	_jsonCache.set(url, promise);
	return promise;
}

export function buildWikiApiUrl(params) {
	const url = new URL("https://wiki.pokexgames.com/api.php");
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null && value !== "") {
			url.searchParams.set(key, value);
		}
	}
	return url.toString();
}

export function fetchWikiApiJson(params) {
	return fetchJson(buildWikiApiUrl(params));
}

export async function runWithConcurrency(items, limit, fn) {
	const results = new Array(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i], i);
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}
