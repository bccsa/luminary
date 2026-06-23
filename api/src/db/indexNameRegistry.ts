import * as fs from "fs";
import * as path from "path";

/**
 * Registry of valid CouchDB Mango index names that a `/query` request may pin via
 * `use_index`. Derived once from the design-doc JSON files in `designDocs/` so the
 * allowlist can never drift from the indexes that actually exist (the old validators
 * hard-coded a 5-name Set and a `^sync-.*-index$` regex — both maintained by hand).
 *
 * Only Mango indexes (design docs with `"language": "query"`) are included; the
 * handful of JavaScript map/reduce views (`parentId`, `slug`, `sync_deprecated`,
 * `view-user-email-userId`) are NOT usable as a Mango `use_index` and are excluded.
 *
 * The view name (key under `views`) is what CouchDB matches when `use_index` is
 * given as a string, so that is what we register.
 */

let cachedRegistry: ReadonlySet<string> | undefined;

/**
 * Pure loader: read every `*.json` design doc in `dir` and return the set of Mango
 * index (view) names. Unparseable or unexpected files are skipped with a warning
 * rather than throwing, so one malformed doc can't take down the whole registry.
 * Exported for tests and for the boot-time warm-up.
 */
export function loadIndexNames(dir: string): Set<string> {
    const names = new Set<string>();

    let files: string[];
    try {
        files = fs.readdirSync(dir);
    } catch (err) {
        console.warn(`indexNameRegistry: could not read design-doc directory '${dir}':`, err);
        return names;
    }

    for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
            const doc = JSON.parse(fs.readFileSync(path.join(dir, file)).toString());
            // Only Mango indexes are valid `use_index` targets.
            if (doc?.language !== "query" || !doc?.views || typeof doc.views !== "object") continue;
            for (const viewName of Object.keys(doc.views)) names.add(viewName);
        } catch (err) {
            console.warn(`indexNameRegistry: skipping unparseable design doc '${file}':`, err);
        }
    }

    return names;
}

/**
 * Lazily-memoized registry over the on-disk `designDocs/` directory. Resolves the
 * same way `db.seedingFunctions.ts` does (`__dirname` + relative dir), so it works
 * both in dev (ts-jest / nest watch) and in prod (`dist/src/db/designDocs`, copied
 * there by `nest-cli.json`). Loaded once on first use; no per-request fs access.
 */
export function getIndexNameRegistry(): ReadonlySet<string> {
    if (!cachedRegistry) {
        cachedRegistry = loadIndexNames(path.join(__dirname, "designDocs"));
    }
    return cachedRegistry;
}

/**
 * Force (re)load of the memoized registry. Called once at boot (after design docs
 * are upserted) so a packaging mistake that drops the JSON assets fails loudly at
 * startup instead of silently rejecting every `use_index` at request time.
 */
export function warmIndexNameRegistry(): ReadonlySet<string> {
    cachedRegistry = loadIndexNames(path.join(__dirname, "designDocs"));
    return cachedRegistry;
}

/** @internal Reset memoization. Test-only. */
export function _resetIndexNameRegistryForTests(): void {
    cachedRegistry = undefined;
}
