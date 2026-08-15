// Decides whether a freshly built bundle is safe to publish over the live one.
//
// `npm run validate` already proves the bundle is well-formed. What it cannot see is that
// the bundle got *smaller* — and that is this project's recurring failure. The wiki keeps
// moving data out of HTML and into JS widgets (see extract-flex-tasks.mjs,
// extract-craft-prof.mjs, extract-clan-effectiveness.mjs, each written after a silent
// collapse). Every one of those produced a perfectly valid bundle that had simply lost
// content. Comparing against what is currently published is the only check that catches it.

export const DEFAULT_MIN_PAGE_RATIO = 0.9;

function countByCategory(pages) {
	const counts = new Map();
	for (const page of pages ?? []) {
		const category = page?.category;
		if (!category) continue;
		counts.set(category, (counts.get(category) ?? 0) + 1);
	}

	return counts;
}

export function summarizeBundle(manifest) {
	return {
		schemaVersion: manifest?.schemaVersion ?? null,
		pageCount: (manifest?.pages ?? []).length,
		categories: countByCategory(manifest?.pages),
	};
}

/**
 * @param built  summarizeBundle() of the bundle about to be published
 * @param live   summarizeBundle() of the currently published bundle, or null when the
 *               published bundle could not be read. A first publish has no baseline, so
 *               an unreachable baseline warns rather than blocks — refusing to publish
 *               because nothing is published yet would be a deadlock.
 */
export function evaluatePublishGuard({ built, live, force = false, minRatio = DEFAULT_MIN_PAGE_RATIO }) {
	const blocking = [];
	const warnings = [];

	if (!built || built.pageCount === 0) {
		blocking.push("built bundle has no pages");
	}

	if (!live) {
		warnings.push("no published bundle to compare against; skipping regression checks");
	} else if (built && built.pageCount > 0) {
		const floor = Math.floor(live.pageCount * minRatio);
		if (built.pageCount < floor) {
			blocking.push(
				`page count fell from ${live.pageCount} to ${built.pageCount}, below the ${Math.round(minRatio * 100)}% floor of ${floor}`,
			);
		}

		// A category going to zero is the signature of a source shape change, and it
		// survives a page-count check whenever the category is small.
		for (const [category, liveCount] of live.categories) {
			const builtCount = built.categories.get(category) ?? 0;
			if (builtCount === 0) {
				blocking.push(`category "${category}" lost all ${liveCount} of its pages`);
			}
		}
	}

	if (force && blocking.length > 0) {
		return {
			ok: true,
			blocking: [],
			warnings: [...warnings, ...blocking.map((reason) => `forced past: ${reason}`)],
		};
	}

	return { ok: blocking.length === 0, blocking, warnings };
}
