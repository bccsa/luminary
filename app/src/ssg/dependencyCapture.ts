import type { DependencyKey } from "./dependencyKeys";

/**
 * Render-time dependency CAPTURE (spec §3.2). A per-route collector that build
 * fetchers report into while a page renders; the vite-ssg hooks reset it per
 * route and snapshot it into a route→keys manifest.
 *
 * State lives on `globalThis` (NOT module scope) on purpose: the vite config and
 * the SSR bundle are separate module instances but run in the same Node process,
 * so they must share one collector. This module is also import-safe everywhere —
 * it uses no `import.meta`, Vue, or DOM — and `reportKeys` is a no-op unless a
 * capture is active, so the same call is harmless on the client and native build.
 *
 * NOTE: capture correctness requires vite-ssg `concurrency: 1` (one page rendered
 * at a time → unambiguous attribution to the single shared collector).
 */

type CaptureState = {
    current: Set<DependencyKey>;
    manifest: Record<string, DependencyKey[]>;
};

const GLOBAL_KEY = "__SSG_DEPS__";

function state(): CaptureState | undefined {
    return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as CaptureState | undefined;
}

/** Initialise the collector once, at the start of the prerender pass. */
export function beginCapture(): void {
    const g = globalThis as Record<string, unknown>;
    if (!g[GLOBAL_KEY]) {
        g[GLOBAL_KEY] = { current: new Set<DependencyKey>(), manifest: {} } as CaptureState;
    }
}

/** Reset the per-route collector before each page renders (onBeforePageRender). */
export function resetRoute(): void {
    const s = state();
    if (s) s.current = new Set();
}

/**
 * Report dependency keys read while rendering the current route. No-op unless a
 * capture is active (i.e. only during the SSG prerender) — safe to call from
 * fetchers that also run on the client / native build.
 */
export function reportKeys(keys: Iterable<DependencyKey>): void {
    const s = state();
    if (!s) return;
    for (const k of keys) s.current.add(k);
}

/** Snapshot the current route's collected keys into the manifest (onPageRendered). */
export function snapshotRoute(route: string): void {
    const s = state();
    if (!s) return;
    s.manifest[route] = [...s.current].sort();
}

/** The accumulated route → keys manifest (onFinished). */
export function getManifest(): Record<string, DependencyKey[]> {
    return state()?.manifest ?? {};
}
