/// <reference types="node" />
/**
 * Headless browser-global shims so `luminary-shared` can be imported in a plain Node
 * process (the ISR watcher — see `watch.ts`). The shared bundle touches `window` and
 * `localStorage` at MODULE LOAD (a top-level
 * `window.addEventListener("unhandledrejection", …)` and `@vueuse` `useLocalStorage`),
 * so these must exist BEFORE `luminary-shared` is imported. This module therefore has
 * to be the FIRST import in `watch.ts`.
 *
 * The watcher only uses the REST query path (`queryRemote`), so NO IndexedDB/Dexie is
 * needed. Unlike `polyfills.ts` (jsdom-guarded for the vite-ssg prerender), this runs
 * unconditionally — it is only ever imported by the Node watcher, never the app bundle.
 */

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

const g = globalThis as Record<string, unknown>;

if (!g.localStorage) g.localStorage = makeStorage();
if (!g.sessionStorage) g.sessionStorage = makeStorage();

// `window === globalThis` so `typeof window !== "undefined"` is true (the data layer
// runs as if in a browser) and `window.localStorage` etc. resolve to the same shims.
if (!g.window) g.window = g;

const noop = () => {};
if (typeof g.addEventListener !== "function") g.addEventListener = noop;
if (typeof g.removeEventListener !== "function") g.removeEventListener = noop;
// @vueuse `useLocalStorage` dispatches a storage event on write to sync tabs.
if (typeof g.dispatchEvent !== "function") g.dispatchEvent = () => true;
if (typeof g.CustomEvent !== "function") {
    g.CustomEvent = class {
        type: string;
        detail: unknown;
        constructor(type: string, init?: { detail?: unknown }) {
            this.type = type;
            this.detail = init?.detail;
        }
    };
}
if (typeof g.StorageEvent !== "function") {
    g.StorageEvent = class {
        type: string;
        constructor(type: string) {
            this.type = type;
        }
    };
}
if (typeof g.matchMedia !== "function") {
    g.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: noop,
        removeListener: noop,
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => false,
    });
}
if (!g.location) {
    g.location = {
        href: "http://localhost/",
        origin: "http://localhost",
        protocol: "http:",
        host: "localhost",
        hostname: "localhost",
        pathname: "/",
        search: "",
        hash: "",
    };
}
if (!g.navigator) g.navigator = { userAgent: "luminary-ssg-watcher", languages: ["en"] };

// Minimal `document` — globalConfig reads `document.documentElement.classList` (theme)
// at module load, and a few other no-op DOM touches happen during boot.
if (!g.document) {
    const classList = {
        contains: () => false,
        add: noop,
        remove: noop,
        toggle: () => false,
    };
    g.document = {
        documentElement: {
            classList,
            style: { setProperty: noop, removeProperty: noop },
            setAttribute: noop,
        },
        createElement: () => ({ setAttribute: noop, appendChild: noop, style: {} }),
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null,
        addEventListener: noop,
        removeEventListener: noop,
        head: { appendChild: noop },
        body: { appendChild: noop },
    };
}
(g.window as Record<string, unknown>).document = g.document;
