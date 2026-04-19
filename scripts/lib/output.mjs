import { mkdir, rename, rm, stat } from "node:fs/promises";

import {
	DIST_BUILD_DIR,
	DIST_DIR,
	DIST_PREVIOUS_DIR,
	PAGES_BUILD_DIR,
} from "./shared.mjs";

async function pathExists(target) {
	try {
		await stat(target);
		return true;
	} catch {
		return false;
	}
}

export async function prepareBuildDir() {
	await rm(DIST_BUILD_DIR, { recursive: true, force: true });
	await mkdir(PAGES_BUILD_DIR, { recursive: true });
}

export async function publishBuildDir() {
	await rm(DIST_PREVIOUS_DIR, { recursive: true, force: true });
	if (await pathExists(DIST_DIR)) {
		await rename(DIST_DIR, DIST_PREVIOUS_DIR);
	}

	try {
		await rename(DIST_BUILD_DIR, DIST_DIR);
		await rm(DIST_PREVIOUS_DIR, { recursive: true, force: true });
	} catch (error) {
		if (!(await pathExists(DIST_DIR)) && (await pathExists(DIST_PREVIOUS_DIR))) {
			await rename(DIST_PREVIOUS_DIR, DIST_DIR);
		}
		throw error;
	}
}
