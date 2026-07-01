import type { DependencyKey } from "./facetKeys";

/**
 * Render-time dependency CAPTURE (spec §3.2). The collector lives on
 * `globalThis.__SSG_DEPS__` (initialised + reset per route by `vite.config.web.ts`,
 * which inlines its own copy so the Node tsconfig project doesn't pull in app source).
 *
 * This module exposes only the app-side reporter. It's import-safe everywhere — no
 * `import.meta`, Vue, or DOM — and `reportKeys` is a no-op unless a capture is active,
 * so the same call is harmless on the client and native build.
 */

type CaptureState = {
    current: Set<DependencyKey>;
    manifest: Record<string, DependencyKey[]>;
};

const GLOBAL_KEY = "__SSG_DEPS__";

/**
 * Report dependency keys read while rendering the current route. No-op unless a
 * capture is active (i.e. only during the SSG prerender) — safe to call from
 * fetchers that also run on the client / native build.
 */
export function reportKeys(keys: Iterable<DependencyKey>): void {
    const s = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as CaptureState | undefined;
    if (!s) return;
    for (const k of keys) s.current.add(k);
}
