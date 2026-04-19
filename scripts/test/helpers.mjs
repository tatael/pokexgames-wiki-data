import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";

export async function loadFixture(name) {
	const fixturePath = path.join(process.cwd(), "scripts", "test", "fixtures", name);
	return readFile(fixturePath, "utf8");
}

export async function withTempDir(fn) {
	const tempDir = await mkdtemp(path.join(process.cwd(), ".tmp-wiki-data-test-"));
	try {
		return await fn(tempDir);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}
