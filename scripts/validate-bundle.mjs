import { distExists, validateBundle } from "./lib/wiki.mjs";

async function main() {
	if (!(await distExists())) {
		throw new Error("dist/ does not exist. Run npm run sync first.");
	}

	await validateBundle();
	console.log("Bundle validation passed.");
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
