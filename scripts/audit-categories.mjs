#!/usr/bin/env node
// Cross-category fidelity audit. Scans dist/pages/**/*.json for shape signatures
// that indicate bad source-data normalization (filenames as visible text, garbage
// rewards, self-link cards, raw flat reward dumps, etc.). Signature-based, so one
// upstream rule clears N pages.
//
// Usage:
//   node scripts/audit-categories.mjs                            # ranked global report
//   node scripts/audit-categories.mjs --category=boss-fight      # only this category
//   node scripts/audit-categories.mjs --signature=filename-card  # drill one signature
//   node scripts/audit-categories.mjs --dir=dist.build           # audit a build dir
//   node scripts/audit-categories.mjs --json                     # machine readable

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const onlySignature = (args.find((a) => a.startsWith("--signature=")) ?? "").split("=")[1] || null;
const onlyCategory = (args.find((a) => a.startsWith("--category=")) ?? "").split("=")[1] || null;
const topN = Number((args.find((a) => a.startsWith("--top=")) ?? "").split("=")[1]) || 25;
const distName = (args.find((a) => a.startsWith("--dir=")) ?? "").split("=")[1] || "dist";
const PAGES_DIR = path.isAbsolute(distName)
	? path.join(distName, "pages")
	: path.join(ROOT_DIR, distName, "pages");

const IMAGE_EXT_RE = /\.(?:png|gif|webp|jpe?g|svg)\b/i;
const IMAGE_EXT_END_RE = /\.(?:png|gif|webp|jpe?g|svg)$/i;
const NARRATIVE_VERB_RE = /\b(?:dever[áa]|jogador|necess[áa]rio|n[ií]vel|capturad|capturar|coletad|coletar|registrad|registrar|aten[cç][aã]o|encontr|conversar|falar|fale|entregar|usar|clique|deve\b|precisa)\b/i;
const FLAT_REWARD_PREFIX_RE = /^(?:\d{1,3}(?:[.,]\d{3})+|\d+\s*[kKmM])\s+[A-ZÀ-Ý]/;
const ELEMENT_TOKENS = new Set([
	"normal", "fire", "water", "grass", "electric", "ice", "fighting", "poison", "ground", "flying",
	"psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy", "crystal",
]);
const MOJIBAKE_RE = /[ÃÂ][\xa0-\xbf]|Ã[©®]|â€[\x80-\xbf]/;

const SIGNATURES = {
	"filename-card": "Card label is a raw image filename (linkedCards / questSupport.cards / etc.)",
	"filename-in-content": "Content paragraph/bullet contains a raw .png/.gif/... mid-string",
	"filename-in-summary": "Page summary contains a raw image filename",
	"garbage-reward-name": "Reward name is narrative prose, filename, element token, or over-long",
	"element-label-reward": "Reward name is just an element/type token",
	"self-link-card": "Card slug points back to the current page",
	"flat-reward-paragraph": "Content paragraph is a flattened reward-table dump",
	"empty-section": "Section has no typed payload, no content, no tables, no media",
	"mojibake": "Visible text contains mojibake byte sequences (broken UTF-8 round-trip)",
};

const TYPED_SECTION_KEYS = [
	"facts", "tasks", "taskGroups", "pokemon", "rewards", "profile", "moves", "effectiveness",
	"variants", "abilities", "steps", "locations", "difficulties", "bossSupport", "bossRecommendations",
	"heldEnhancement", "hazards", "dungeonSupport", "heldCategories", "heldBoosts", "heldDetails",
	"questSupport", "questPhases", "combatPokemon", "clanTasks", "embeddedTowerProgression",
	"embeddedTowerUnlocks", "embeddedTowerSupport", "linkedCards", "commerceEntries", "craftEntries",
];

function pickLocale(map) {
	if (!map || typeof map !== "object") return null;
	return map["pt-BR"] ?? map.en ?? map.es ?? Object.values(map)[0] ?? null;
}

function asText(value) {
	return String(value ?? "").trim();
}

function hasMap(map) {
	return Boolean(map && typeof map === "object" && Object.keys(map).length);
}

function isNarrativeRewardName(name) {
	const text = asText(name);
	if (!text) return true;
	if (IMAGE_EXT_RE.test(text)) return true;
	if (NARRATIVE_VERB_RE.test(text)) return true;
	if (text.split(/\s+/).length > 6) return true;
	return false;
}

function collectCards(section) {
	const cards = [];
	const linked = pickLocale(section?.linkedCards);
	if (linked?.cards?.length) cards.push(...linked.cards);
	const support = pickLocale(section?.questSupport);
	if (support?.cards?.length) cards.push(...support.cards);
	return cards;
}

function collectRewards(section) {
	const out = [];
	const direct = pickLocale(section?.rewards);
	if (Array.isArray(direct)) out.push(...direct);
	const phase = pickLocale(section?.questPhases);
	if (Array.isArray(phase?.rewards)) out.push(...phase.rewards);
	return out;
}

function collectVisibleStrings(section) {
	const out = [];
	const content = pickLocale(section?.content);
	if (Array.isArray(content?.paragraphs)) out.push(...content.paragraphs);
	if (Array.isArray(content?.bullets)) out.push(...content.bullets);
	const phase = pickLocale(section?.questPhases);
	if (phase) {
		if (Array.isArray(phase.body)) out.push(...phase.body);
		if (Array.isArray(phase.bullets)) out.push(...phase.bullets);
	}
	const support = pickLocale(section?.questSupport);
	if (support) {
		if (Array.isArray(support.intro)) out.push(...support.intro);
		if (Array.isArray(support.bullets)) out.push(...support.bullets);
	}
	return out;
}

function auditPage(page) {
	const findings = [];
	const add = (signature, detail) => findings.push({ signature, detail });
	const sections = Array.isArray(page.sections) ? page.sections : [];
	const pageSlug = asText(page.slug);

	// Page-level
	const summary = asText(pickLocale(page.summary));
	if (summary && IMAGE_EXT_RE.test(summary)) add("filename-in-summary", summary.slice(0, 80));
	if (summary && MOJIBAKE_RE.test(summary)) add("mojibake", `summary: ${summary.slice(0, 60)}`);

	for (const section of sections) {
		const sid = asText(section?.id);

		const hasTyped = TYPED_SECTION_KEYS.some((k) => section?.[k]);
		const hasContent = hasMap(section?.content);
		const hasTables = hasMap(section?.tables);
		const hasMedia = hasMap(section?.media) || hasMap(section?.mediaRefs);
		if (!hasTyped && !hasContent && !hasTables && !hasMedia) add("empty-section", sid);

		for (const card of collectCards(section)) {
			const label = asText(card?.label);
			if (label && IMAGE_EXT_END_RE.test(label)) add("filename-card", `${sid}: "${label}"`);
			if (card?.slug && pageSlug && card.slug === pageSlug) add("self-link-card", `${sid}: ${card.slug}`);
		}

		for (const reward of collectRewards(section)) {
			const name = asText(reward?.name);
			if (isNarrativeRewardName(name)) add("garbage-reward-name", `${sid}: "${name.slice(0, 60)}"`);
			else if (ELEMENT_TOKENS.has(name.toLowerCase())) add("element-label-reward", `${sid}: "${name}"`);
		}

		for (const value of collectVisibleStrings(section)) {
			const text = asText(value);
			if (!text) continue;
			if (IMAGE_EXT_RE.test(text)) add("filename-in-content", `${sid}: "${text.slice(0, 80)}"`);
			if (FLAT_REWARD_PREFIX_RE.test(text) && !NARRATIVE_VERB_RE.test(text)) add("flat-reward-paragraph", `${sid}: "${text.slice(0, 80)}"`);
			if (MOJIBAKE_RE.test(text)) add("mojibake", `${sid}: "${text.slice(0, 60)}"`);
		}
	}

	return findings;
}

async function walk(dir) {
	const out = [];
	let entries;
	try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(full)));
		else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
	}
	return out;
}

async function main() {
	const files = await walk(PAGES_DIR);
	if (!files.length) {
		console.error(`No pages under ${PAGES_DIR}. Run sync first.`);
		process.exit(1);
	}

	const perPage = [];
	const sigPageCount = new Map();
	const sigOccurrences = new Map();
	const catPageCount = new Map();
	const catSigPageCount = new Map(); // category -> Map<signature, pages>

	for (const file of files) {
		let page;
		try { page = JSON.parse(await readFile(file, "utf8")); } catch { continue; }
		const category = asText(page.category) || "(unknown)";
		if (onlyCategory && category !== onlyCategory) continue;
		catPageCount.set(category, (catPageCount.get(category) ?? 0) + 1);

		const findings = auditPage(page);
		if (!findings.length) continue;

		const relPath = path.relative(PAGES_DIR, file).replace(/\\/g, "/");
		const bySig = new Map();
		const catMap = catSigPageCount.get(category) ?? new Map();
		catSigPageCount.set(category, catMap);
		for (const { signature, detail } of findings) {
			sigOccurrences.set(signature, (sigOccurrences.get(signature) ?? 0) + 1);
			if (!bySig.has(signature)) {
				bySig.set(signature, []);
				sigPageCount.set(signature, (sigPageCount.get(signature) ?? 0) + 1);
				catMap.set(signature, (catMap.get(signature) ?? 0) + 1);
			}
			bySig.get(signature).push(detail);
		}
		perPage.push({ category, slug: page.slug, relPath, count: findings.length, bySig });
	}

	if (onlySignature) {
		const matches = perPage.filter((p) => p.bySig.has(onlySignature));
		console.log(`\nSignature: ${onlySignature} — ${SIGNATURES[onlySignature] ?? "(unknown)"}`);
		console.log(`Pages affected: ${matches.length}\n`);
		for (const p of matches.sort((a, b) => b.bySig.get(onlySignature).length - a.bySig.get(onlySignature).length).slice(0, topN * 3)) {
			console.log(`  [${p.category}] ${p.relPath}`);
			for (const detail of p.bySig.get(onlySignature).slice(0, 5)) console.log(`      - ${detail}`);
		}
		return;
	}

	if (wantJson) {
		console.log(JSON.stringify({
			scanned: files.length,
			pagesWithIssues: perPage.length,
			signatures: Object.fromEntries([...sigPageCount.entries()].map(([k, v]) => [k, { pages: v, occurrences: sigOccurrences.get(k) }])),
			categories: Object.fromEntries([...catSigPageCount.entries()].map(([cat, map]) => [cat, Object.fromEntries(map)])),
			worst: perPage.sort((a, b) => b.count - a.count).slice(0, topN).map((p) => ({ category: p.category, slug: p.slug, relPath: p.relPath, count: p.count, signatures: [...p.bySig.keys()] })),
		}, null, 2));
		return;
	}

	console.log(`\nCategory audit — scanned ${files.length} pages, ${perPage.length} have issues.\n`);
	console.log("By signature (global):");
	const ranked = [...sigPageCount.entries()].sort((a, b) => b[1] - a[1]);
	const pad = Math.max(...ranked.map(([s]) => s.length), 10);
	for (const [sig, pages] of ranked) {
		console.log(`  ${sig.padEnd(pad)}  ${String(pages).padStart(5)} pages  ${String(sigOccurrences.get(sig)).padStart(6)} hits  — ${SIGNATURES[sig] ?? ""}`);
	}

	console.log(`\nBy category (issue counts):`);
	const cats = [...catPageCount.keys()].sort();
	for (const cat of cats) {
		const total = catPageCount.get(cat);
		const map = catSigPageCount.get(cat);
		const broken = map ? [...map.values()].reduce((a, b) => Math.max(a, b), 0) : 0;
		const sigSummary = map ? [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, n]) => `${s}:${n}`).join(", ") : "";
		console.log(`  ${cat.padEnd(24)}  ${String(total).padStart(5)} total  ${String(broken).padStart(5)} worst-sig  ${sigSummary}`);
	}

	console.log(`\nWorst ${Math.min(topN, perPage.length)} pages:`);
	for (const p of perPage.sort((a, b) => b.count - a.count).slice(0, topN)) {
		console.log(`  ${String(p.count).padStart(3)}  [${p.category}] ${p.relPath}  [${[...p.bySig.keys()].join(", ")}]`);
	}
	console.log(`\nDrill: node scripts/audit-categories.mjs --signature=<name>  or  --category=<name>`);
}

main();
