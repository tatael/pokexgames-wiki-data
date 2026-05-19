import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

import { withTempDir } from "./helpers.mjs";

const sharedModuleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "lib", "shared.mjs")).href;

function readFetchMode(cwd, env = {}) {
	const childEnv = { ...process.env };
	delete childEnv.WIKI_FETCH_MODE;
	Object.assign(childEnv, env);

	const result = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"--eval",
			`import { WIKI_FETCH_MODE } from ${JSON.stringify(sharedModuleUrl)}; console.log(WIKI_FETCH_MODE);`,
		],
		{
			cwd,
			env: childEnv,
			encoding: "utf8",
		},
	);

	assert.equal(result.status, 0, result.stderr);
	return result.stdout.trim();
}

test("shared config loads .env before reading wiki fetch mode", async () => {
	await withTempDir(async (tempDir) => {
		await writeFile(path.join(tempDir, ".env"), "WIKI_FETCH_MODE=prefer-cache\n", "utf8");

		assert.equal(readFetchMode(tempDir), "prefer-cache");
	});
});

test("terminal environment overrides .env values", async () => {
	await withTempDir(async (tempDir) => {
		await writeFile(path.join(tempDir, ".env"), "WIKI_FETCH_MODE=prefer-cache\n", "utf8");

		assert.equal(readFetchMode(tempDir, { WIKI_FETCH_MODE: "cache" }), "cache");
	});
});
