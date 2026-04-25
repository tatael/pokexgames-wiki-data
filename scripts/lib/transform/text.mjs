

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

function repairMojibake(value) {
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
