import { PT_BR } from "./shared.mjs";

const LOCALE_ORDER = [PT_BR, "en", "es"];

function stableStringify(value) {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}

	if (value && typeof value === "object") {
		const keys = Object.keys(value).sort();
		return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
	}

	return JSON.stringify(value);
}

function hasMeaningfulValue(value) {
	if (value == null) return false;
	if (typeof value === "string") return Boolean(value.trim());
	if (Array.isArray(value)) return value.length > 0;
	if (typeof value === "object") return Object.keys(value).length > 0;
	return true;
}

export function compactLocalizedValueMap(values) {
	if (!values || typeof values !== "object" || Array.isArray(values)) return values;

	const output = {};
	const seen = new Set();

	for (const locale of LOCALE_ORDER) {
		if (!(locale in values)) continue;
		const value = values[locale];
		if (!hasMeaningfulValue(value)) continue;
		const fingerprint = stableStringify(value);
		if (seen.has(fingerprint)) continue;
		seen.add(fingerprint);
		output[locale] = value;
	}

	for (const [locale, value] of Object.entries(values)) {
		if (locale in output) continue;
		if (!hasMeaningfulValue(value)) continue;
		const fingerprint = stableStringify(value);
		if (seen.has(fingerprint)) continue;
		seen.add(fingerprint);
		output[locale] = value;
	}

	return output;
}
