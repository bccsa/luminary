import type { DependencyKey } from "./facetKeys";

/**
 * Render-time dependency capture. The collector lives on `globalThis.__SSG_DEPS__`
 * (initialised + reset per route by `vite.config.web.ts`, which inlines its own
 * copy so the Node tsconfig project doesn't pull in app source). This module is
 * only the reporter side — import-safe everywhere, since `reportKeys` no-ops
 * unless a capture is active, so the same call site is harmless on client/native.
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
