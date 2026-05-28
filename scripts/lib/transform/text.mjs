

export function normalizeForRarity(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

export function cleanStructuredText(value) {
	const text = repairMojibake(String(value ?? ""));

	return text
		.replace(/\s+/g, " ")
		.replace(/\s+\./g, ".")
		.trim()
		.replace(/[.,;:]$/, "")
		.trim();
}

const MEDIA_EXT_RE = /(?:png|gif|webp|jpe?g|svg)/i;

function stripPrecedingLabelMatches(text, extPattern) {
	let out = "";
	let lastIndex = 0;
	const extRe = new RegExp(`\\.${extPattern}\\b`, "gi");
	let match;
	while ((match = extRe.exec(text)) !== null) {
		const extStart = match.index;
		const extEnd = extStart + match[0].length;
		// walk backward from extStart to collect up to 12 word run
		let cursor = extStart;
		while (cursor > 0 && /[\p{L}\p{N}_'-]/u.test(text[cursor - 1])) cursor -= 1;
		// cursor now at start of the last word of the file
		const wordRunStart = (() => {
			let c = cursor;
			let words = 1;
			while (c > 0 && words < 12) {
				if (!/\s/.test(text[c - 1])) break;
				let space = c - 1;
				while (space > 0 && /\s/.test(text[space - 1])) space -= 1;
				if (space === 0 || !/[\p{L}\p{N}_'-]/u.test(text[space - 1])) break;
				// walk back through previous word
				let wordStart = space;
				while (wordStart > 0 && /[\p{L}\p{N}_'-]/u.test(text[wordStart - 1])) wordStart -= 1;
				c = wordStart;
				words += 1;
			}
			return c;
		})();
		const wordRun = text.slice(wordRunStart, extStart);
		const tokens = wordRun.split(/\s+/).filter(Boolean);
		if (tokens.length < 2) {
			out += text.slice(lastIndex, extEnd);
			lastIndex = extEnd;
			continue;
		}
		// try to find a split [label | file] where normalized equal (independent counts)
		let stripStart = -1;
		for (let fileLen = Math.min(6, tokens.length - 1); fileLen >= 1; fileLen -= 1) {
			const fileTokens = tokens.slice(tokens.length - fileLen);
			const fileNorm = normalizeMediaCompareToken(fileTokens.join(" "));
			if (!fileNorm) continue;
			const labelMax = Math.min(8, tokens.length - fileLen);
			for (let labelLen = labelMax; labelLen >= 1; labelLen -= 1) {
				const labelTokens = tokens.slice(tokens.length - fileLen - labelLen, tokens.length - fileLen);
				if (labelTokens.length !== labelLen) continue;
				if (normalizeMediaCompareToken(labelTokens.join(" ")) === fileNorm) {
					const fileStr = fileTokens.join(" ");
					const idx = wordRun.lastIndexOf(fileStr);
					if (idx >= 0) {
						stripStart = wordRunStart + idx;
						while (stripStart > 0 && /\s/.test(text[stripStart - 1])) stripStart -= 1;
					}
					break;
				}
			}
			if (stripStart >= 0) break;
		}
		if (stripStart >= 0) {
			out += text.slice(lastIndex, stripStart);
			lastIndex = extEnd;
		} else {
			out += text.slice(lastIndex, extEnd);
			lastIndex = extEnd;
		}
	}
	out += text.slice(lastIndex);
	return out;
}

function normalizeMediaCompareToken(value = "") {
	return String(value ?? "")
		.toLowerCase()
		.replace(/\b\d{1,4}[-_\s]+/g, " ")
		.replace(/[_\s-]+/g, " ")
		.trim();
}

export function stripInlineMediaRefs(value) {
	let text = String(value ?? "");
	if (!text) return "";
	const namePartClass = "[\\p{L}\\p{N}_'-]";
	const namePartGroup = `${namePartClass}+(?:\\s+${namePartClass}+){0,5}`;
	const lonelyGroup = `${namePartClass}+(?:\\s+${namePartClass}+){0,3}`;
	const ext = "(?:png|gif|webp|jpe?g|svg)";

	// Strip "Label Label.png" / "Label Label_Variant.png" patterns by scanning each
	// .png/.gif/etc occurrence and checking whether immediately-preceding tokens
	// match the file-name tokens (case/underscore/space insensitive). Keep the
	// label, drop the file ref.
	text = stripPrecedingLabelMatches(text, ext);

	const dupRe = new RegExp(`(${namePartGroup})\\.${ext}\\s+\\1(?=\\b|\\s|$|[,.;:!?])`, "giu");
	let prev;
	do { prev = text; text = text.replace(dupRe, "$1"); } while (text !== prev);
	const lonelyRe = new RegExp(`(^|\\s|[(\\[])${lonelyGroup}\\.${ext}(?=\\s|$|[,.;:!?)\\]])`, "giu");
	text = text.replace(lonelyRe, (match, lead) => lead || "");
	text = text.replace(/\b(\d{1,4})-([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]+)/g, "$2");
	text = text.replace(/\s{2,}/g, " ").trim();
	return text;
}

export { MEDIA_EXT_RE };

export function repairMojibake(value) {
	let text = value;
	text = text.replace(/[\u00C2\u00C3][\u0080-\u00BF]/g, (match) =>
		Buffer.from([...match].map((char) => char.charCodeAt(0))).toString("utf8")
	);

	for (let index = 0; index < 3 && /[ÃÂâ]/.test(text); index += 1) {
		const repaired = Buffer.from(text, "latin1").toString("utf8");
		if (repaired.includes("�") || repaired === text) break;
		text = repaired;
	}

	return text
		.replaceAll("Ã‰", "É")
		.replaceAll("Ã€", "À")
		.replaceAll("Ã‡", "Ç")
		.replaceAll("â€“", "–")
		.replaceAll("â€”", "—");
}

export function displayStructuredText(value) {
	const text = cleanStructuredText(value);
	if (!text) return "";
	const lower = text.toLowerCase();
	if (lower === "none" || lower === "nenhuma" || lower === "nenhum") return "Nenhuma";
	return text;
}

export function dedupeBySlug(values, slugger) {
	const seen = new Set();
	return values.filter((value) => {
		const key = slugger(value);
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function normalizeIdToken(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function stripImageRefFromText(text) {
	let s = String(text ?? "").trim();
	if (!s) return "";
	if (/^[^\s]+\.(gif|png|jpg|jpeg|webp|svg)$/i.test(s)) return "";
	s = s.replace(/^\S+\.(gif|png|jpg|jpeg|webp|svg)\s+/i, "");
	s = s.replace(/^\d{1,4}[-_.][^\s]+\s+/i, "");
	s = s.replace(/^\d+\s+/, "");
	s = s.replace(/\s*\*+$/, "").trim();

	let words = s.split(" ");
	let changed = true;
	while (changed) {
		changed = false;
		for (let half = Math.floor(words.length / 2); half >= 1; half--) {
			if (half * 2 !== words.length) continue;
			if (words.slice(0, half).join(" ").toLowerCase() === words.slice(half).join(" ").toLowerCase()) {
				s = words.slice(half).join(" "); words = s.split(" "); changed = true; break;
			}
		}

		if (changed) continue;
		for (let i = 0; i < words.length - 1; i++) {
			const lw = words[i].toLowerCase();
			for (let j = i + 1; j < words.length; j++) {
				if (words[j].toLowerCase() === lw) {
					s = words.slice(i + 1).join(" "); words = s.split(" "); changed = true; break;
				}
			}

			if (changed) break;
		}

		if (changed) continue;
		if (words.length >= 2) {
			const fn = words[0].toLowerCase().replace(/[^a-z]/g, "");
			const rn = words.slice(1).join("").toLowerCase().replace(/[^a-z]/g, "");
			if (fn.length >= 3 && rn.startsWith(fn)) {
				s = words.slice(1).join(" "); words = s.split(" "); changed = true;
			}
		}
	}

	if (words.length >= 2 && /^[a-z]/.test(words[0])) {
		const rest = words.slice(1);
		const nextUpper = rest.findIndex((w) => /^[A-Z]/.test(w));
		if (nextUpper >= 0) s = rest.slice(nextUpper).join(" ");
	}

	return s.replace(/^thread\s+/i, "").trim();
}
