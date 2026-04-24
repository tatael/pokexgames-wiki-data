

export function normalizeForRarity(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

export function cleanStructuredText(value) {
	return String(value ?? "")
		.replace(/\s+/g, " ")
		.replace(/\s+\./g, ".")
		.trim()
		.replace(/[.,;:]$/, "")
		.trim();
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
