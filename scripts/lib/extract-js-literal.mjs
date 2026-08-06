// Several wiki tool pages ship their data as a plain `const NAME = [...]` array literal
// inside an inline <script>, which extractArticleHtml strips. The literals are
// JSON-shaped apart from bare keys and trailing commas, so they can be read without
// evaluating any of the page's JavaScript.

function sliceBalanced(source, startIdx) {
	const open = source[startIdx];
	const close = open === "[" ? "]" : "}";
	let depth = 0;
	let inString = false;
	let quote = "";
	let escaped = false;

	for (let index = startIdx; index < source.length; index += 1) {
		const char = source[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === quote) inString = false;
			continue;
		}

		if (char === '"' || char === "'" || char === "`") {
			inString = true;
			quote = char;
		} else if (char === open) {
			depth += 1;
		} else if (char === close) {
			depth -= 1;
			if (depth === 0) return source.slice(startIdx, index + 1);
		}
	}

	return null;
}

// Rewrites the JS-object dialect into JSON: bare keys get quoted, single-quoted strings
// become double-quoted, and trailing commas go away. Anything inside a string literal is
// copied through untouched so a comma or brace in prose cannot corrupt the result.
function toJson(source) {
	let out = "";
	let index = 0;

	while (index < source.length) {
		const char = source[index];

		if (char === '"' || char === "'") {
			const quote = char;
			let value = "";
			index += 1;
			while (index < source.length && source[index] !== quote) {
				if (source[index] === "\\") {
					value += source[index] + (source[index + 1] ?? "");
					index += 2;
					continue;
				}

				value += source[index];
				index += 1;
			}

			index += 1;
			out += JSON.stringify(value.replace(/\\'/g, "'"));
			continue;
		}

		// A bare key: an identifier or a number immediately followed by a colon. Numeric
		// keys are how `pokemonByBoost` indexes its buckets (`50: [...]`).
		const key = /^([A-Za-z_$][\w$]*|\d+)\s*:/.exec(source.slice(index));
		if (key && /[{,\s]$/.test(out.slice(-1) || "{")) {
			out += `${JSON.stringify(key[1])}:`;
			index += key[0].length;
			continue;
		}

		out += char;
		index += 1;
	}

	return out.replace(/,(\s*[}\]])/g, "$1");
}

// Reads `const NAME = [...]` / `NAME = {...}` and returns the parsed value, or null when
// the page does not carry that literal or it is not parseable as data.
export function extractJsLiteral(html, name) {
	const source = String(html ?? "");
	const assignment = new RegExp(`\\b${name}\\s*=\\s*[[{]`).exec(source);
	if (!assignment) return null;
	const startIdx = assignment.index + assignment[0].length - 1;
	const slice = sliceBalanced(source, startIdx);
	if (!slice) return null;
	try {
		return JSON.parse(toJson(slice));
	} catch {
		return null;
	}
}
