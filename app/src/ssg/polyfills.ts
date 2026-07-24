/**
 * Node/SSG polyfills for browser globals that aren't available (or aren't
 * exposed as bare globals) during the vite-ssg prerender in Node.
 *
 * This module MUST be imported first in the web/SSG entry (`main.web.ts`) so the
 * stubs are installed before any module that touches these globals at import
 * time — e.g. `globalConfig.ts` reads `localStorage` and calls `window.matchMedia`
 * at module load.
 *
 * Only the web build imports this; the native/SPA build never loads it.
 */

// Run only in the SSG/Node render (a real browser already has all of these).
if (typeof window !== "undefined") {
    // --- Storage (localStorage / sessionStorage) ---
    // jsdom (vite-ssg `mock: true`) exposes Storage on `window`, but not always
    // as a bare global, and Node's native experimental localStorage is
    // unavailable without `--localstorage-file`. Provide a simple in-memory shim
    // so prerender reads return empty and writes are harmless.
    const makeStorage = (): Storage => {
        const map = new Map<string, string>();
        return {
            get length() {
                return map.size;
            },
            clear: () => map.clear(),
            getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
            key: (i: number) => Array.from(map.keys())[i] ?? null,
            removeItem: (k: string) => void map.delete(k),
            setItem: (k: string, v: string) => void map.set(k, String(v)),
        } as Storage;
    };

    const g = globalThis as unknown as {
        localStorage?: Storage;
        sessionStorage?: Storage;
    };
    if (!g.localStorage) g.localStorage = window.localStorage ?? makeStorage();
    if (!g.sessionStorage) g.sessionStorage = window.sessionStorage ?? makeStorage();

    // --- matchMedia (not implemented by jsdom) ---
    if (typeof window.matchMedia !== "function") {
        // Minimal MediaQueryList stub — SSR renders the light/default theme.
        window.matchMedia = ((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {
                return false;
            },
        })) as unknown as typeof window.matchMedia;
    }
}
