#!/usr/bin/env node
// Quest fidelity audit. Scans dist/pages/quests/**.json for known breakage signatures
// so we fix by signature (one rule -> many pages) instead of page-by-page.
//
// Usage:
//   node scripts/audit-quests.mjs                 # ranked report
//   node scripts/audit-quests.mjs --signature=garbage-reward-name   # list pages for one signature
//   node scripts/audit-quests.mjs --json          # machine-readable output
//   node scripts/audit-quests.mjs --top=40        # change worst-pages cutoff

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const onlySignature = (args.find((a) => a.startsWith("--signature=")) ?? "").split("=")[1] || null;
const topN = Number((args.find((a) => a.startsWith("--top=")) ?? "").split("=")[1]) || 25;
const distName = (args.find((a) => a.startsWith("--dir=")) ?? "").split("=")[1] || "dist";
const QUESTS_DIR = path.isAbsolute(distName)
	? path.join(distName, "pages", "quests")
	: path.join(ROOT_DIR, distName, "pages", "quests");

const IMAGE_EXT_RE = /\.(?:png|gif|webp|jpe?g|svg)\b/i;
const NARRATIVE_VERB_RE = /\b(?:dever[áa]|jogador|necess[áa]rio|n[ií]vel|capturad|capturar|coletad|coletar|registrad|registrar|aten[cç][aã]o|encontr|conversar|falar|fale|entregar|usar|clique|deve\b|precisa)\b/i;
const FLAT_REWARD_PREFIX_RE = /^(?:\d{1,3}(?:[.,]\d{3})+|\d+\s*[kKmM])\s+[A-ZÀ-Ý]/;
const ELEMENT_TOKENS = new Set([
	"normal", "fire", "water", "grass", "electric", "ice", "fighting", "poison", "ground", "flying",
	"psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy", "crystal",
]);

const SIGNATURES = {
	"garbage-reward-name": "Reward name is narrative prose, a filename, or unreasonably long",
	"flat-reward-body": "Quest body paragraph is a flattened reward-table dump",
	"filename-card": "Quest support card label is a raw image filename",
	"self-link-card": "Quest support card links to the page itself",
	"element-label-reward": "Reward name is just an element/type token",
	"empty-phase": "questPhases present but has no body/rewards/rows/maps",
	"generic-only": "Quest page has no typed quest sections (questPhases/questSupport/etc.)",
};

const TYPED_QUEST_FIELDS = [
	"questPhases", "questSupport", "questPhases", "locations", "rewards", "steps",
	"combatPokemon", "linkedCards", "facts", "pokemon",
];

function pickLocale(map) {
	if (!map || typeof map !== "object") return null;
	return map["pt-BR"] ?? map.en ?? map.es ?? Object.values(map)[0] ?? null;
}

function asText(value) {
	return String(value ?? "").trim();
}

function isNarrativeRewardName(name) {
	const text = asText(name);
	if (!text) return true;
	if (IMAGE_EXT_RE.test(text)) return true;
	if (NARRATIVE_VERB_RE.test(text)) return true;
	if (text.split(/\s+/).length > 6) return true;
	return false;
}

function auditPage(page, relPath) {
	const findings = [];
	const add = (signature, detail) => findings.push({ signature, detail });
	const sections = Array.isArray(page.sections) ? page.sections : [];

	let hasTypedQuestSection = false;

	for (const section of sections) {
		const id = asText(section?.id);
		const phase = pickLocale(section?.questPhases);
		const support = pickLocale(section?.questSupport);

		if (TYPED_QUEST_FIELDS.some((field) => section?.[field])) hasTypedQuestSection = true;

		if (phase) {
			const body = Array.isArray(phase.body) ? phase.body : [];
			const bullets = Array.isArray(phase.bullets) ? phase.bullets : [];
			const rewards = Array.isArray(phase.rewards) ? phase.rewards : [];
			const rows = Array.isArray(phase.rows) ? phase.rows : [];
			const maps = Array.isArray(phase.maps) ? phase.maps : [];

			if (!body.length && !bullets.length && !rewards.length && !rows.length && !maps.length) {
				add("empty-phase", id);
			}

			for (const line of body) {
				const text = asText(line);
				if (FLAT_REWARD_PREFIX_RE.test(text) && !NARRATIVE_VERB_RE.test(text)) {
					add("flat-reward-body", text.slice(0, 80));
				}
			}

			for (const reward of rewards) {
				const name = asText(reward?.name);
				if (isNarrativeRewardName(name)) add("garbage-reward-name", `${id}: "${name.slice(0, 60)}"`);
				else if (ELEMENT_TOKENS.has(name.toLowerCase())) add("element-label-reward", `${id}: "${name}"`);
			}
		}

		if (support) {
			const cards = Array.isArray(support.cards) ? support.cards : [];
			for (const card of cards) {
				const label = asText(card?.label);
				if (/\.(?:png|gif|webp|jpe?g|svg)$/i.test(label)) add("filename-card", `${id}: "${label}"`);
				if (card?.slug && card.slug === page.slug) add("self-link-card", `${id}: ${card.slug}`);
			}
		}
	}

	if (sections.length && !hasTypedQuestSection) add("generic-only", `${sections.length} sections, none typed`);

	return findings;
}

async function walk(dir) {
	const out = [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(full)));
		else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
	}
	return out;
}

async function main() {
	const files = await walk(QUESTS_DIR);
	if (!files.length) {
		console.error(`No quest pages found under ${QUESTS_DIR}. Run sync first.`);
		process.exit(1);
	}

	const perPage = [];
	const sigPageCount = new Map();
	const sigOccurrences = new Map();

	for (const file of files) {
		let page;
		try {
			page = JSON.parse(await readFile(file, "utf8"));
		} catch {
			continue;
		}
		const relPath = path.relative(QUESTS_DIR, file).replace(/\\/g, "/");
		const findings = auditPage(page, relPath);
		if (!findings.length) continue;

		const bySig = new Map();
		for (const { signature, detail } of findings) {
			sigOccurrences.set(signature, (sigOccurrences.get(signature) ?? 0) + 1);
			if (!bySig.has(signature)) {
				bySig.set(signature, []);
				sigPageCount.set(signature, (sigPageCount.get(signature) ?? 0) + 1);
			}
			bySig.get(signature).push(detail);
		}
		perPage.push({ slug: page.slug, relPath, count: findings.length, bySig });
	}

	if (onlySignature) {
		const matches = perPage.filter((p) => p.bySig.has(onlySignature));
		console.log(`\nSignature: ${onlySignature} — ${SIGNATURES[onlySignature] ?? "(unknown)"}`);
		console.log(`Pages affected: ${matches.length}\n`);
		for (const p of matches.sort((a, b) => b.bySig.get(onlySignature).length - a.bySig.get(onlySignature).length)) {
			console.log(`  ${p.relPath}`);
			for (const detail of p.bySig.get(onlySignature).slice(0, 6)) console.log(`      - ${detail}`);
		}
		return;
	}

	if (wantJson) {
		console.log(JSON.stringify({
			scanned: files.length,
			pagesWithIssues: perPage.length,
			signatures: Object.fromEntries([...sigPageCount.entries()].map(([k, v]) => [k, { pages: v, occurrences: sigOccurrences.get(k) }])),
			worst: perPage.sort((a, b) => b.count - a.count).slice(0, topN).map((p) => ({ slug: p.slug, relPath: p.relPath, count: p.count, signatures: [...p.bySig.keys()] })),
		}, null, 2));
		return;
	}

	console.log(`\nQuest audit — scanned ${files.length} pages, ${perPage.length} have issues.\n`);
	console.log("By signature (fix these top-down; one rule clears many pages):");
	const ranked = [...sigPageCount.entries()].sort((a, b) => b[1] - a[1]);
	const pad = Math.max(...ranked.map(([s]) => s.length), 10);
	for (const [sig, pages] of ranked) {
		console.log(`  ${sig.padEnd(pad)}  ${String(pages).padStart(4)} pages  ${String(sigOccurrences.get(sig)).padStart(5)} hits  — ${SIGNATURES[sig] ?? ""}`);
	}

	console.log(`\nWorst ${Math.min(topN, perPage.length)} pages:`);
	for (const p of perPage.sort((a, b) => b.count - a.count).slice(0, topN)) {
		console.log(`  ${String(p.count).padStart(3)}  ${p.relPath}  [${[...p.bySig.keys()].join(", ")}]`);
	}
	console.log(`\nDrill into one signature: node scripts/audit-quests.mjs --signature=<name>`);
}

main();
