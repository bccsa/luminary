import type { DependencyKey } from "luminary-shared";

/**
 * Render-time dependency capture. The collector lives on `globalThis.__SSG_DEPS__`
 * (initialised by `vite.config.web.ts`, which inlines its own copy so the Node tsconfig
 * project doesn't pull in app source). This module is only the reporter side —
 * import-safe everywhere, since `reportKeys` no-ops unless a capture is active, so the
 * same call site is harmless on client/the normal SPA.
 *
 * Everything here is keyed by route: vite-ssg renders pages concurrently, and a single
 * shared "current" accumulator would attribute one page's keys to whichever page happened
 * to finish next. That failure is silent — `ssg-deps.json` just gains wrong route→key
 * mappings, and the mis-keyed pages then never regenerate when their data changes.
 */

type CaptureState = {
    /** route path → the dependency keys read while rendering it. */
    manifest: Record<string, Set<DependencyKey>>;
    /** route path → the `hqcache:*` entries that route's prerender primed. */
    cache: Record<string, Record<string, string>>;
};

const GLOBAL_KEY = "__SSG_DEPS__";

function capture(): CaptureState | undefined {
    return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as CaptureState | undefined;
}

/**
 * Report dependency keys read while rendering `route`. No-op unless a capture is active
 * (i.e. only during the SSG prerender) — safe to call from fetchers that also run on the
 * client / normal SPA build.
 */
export function reportKeys(route: string, keys: Iterable<DependencyKey>): void {
    const state = capture();
    if (!state) return;
    const forRoute = (state.manifest[route] ??= new Set<DependencyKey>());
    for (const key of keys) forRoute.add(key);
}

/**
 * Record one response-cache entry primed while rendering `route`, so the page's inline seed
 * can be assembled from its own entries alone. Reading them back out of the shared
 * `localStorage` at the end of a render would pick up whatever concurrent pages wrote there.
 */
export function reportCacheEntry(route: string, key: string, value: string): void {
    const state = capture();
    if (!state) return;
    (state.cache[route] ??= {})[key] = value;
}
