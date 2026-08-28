import { afterEach, describe, expect, it, vi } from "vitest";

// polyfills.ts installs its shims as a top-level side effect on import, guarded by
// `typeof window !== "undefined"` and "already present?" checks — so each test
// resets the module registry (to re-run that side effect) and dynamically
// re-imports after arranging the global state it wants the guard to see.

const importPolyfills = async () => {
    vi.resetModules();
    await import("./polyfills");
};

describe("polyfills", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe("localStorage / sessionStorage shim", () => {
        let originalLocalStorage: Storage | undefined;
        let originalSessionStorage: Storage | undefined;

        afterEach(() => {
            globalThis.localStorage = originalLocalStorage as Storage;
            globalThis.sessionStorage = originalSessionStorage as Storage;
        });

        it("installs a working in-memory Storage when none is present", async () => {
            originalLocalStorage = globalThis.localStorage;
            originalSessionStorage = globalThis.sessionStorage;
            // @ts-expect-error simulating an environment with no Storage global
            delete globalThis.localStorage;
            // @ts-expect-error simulating an environment with no Storage global
            delete globalThis.sessionStorage;

            await importPolyfills();

            expect(globalThis.localStorage).toBeDefined();
            globalThis.localStorage.setItem("a", "1");
            expect(globalThis.localStorage.getItem("a")).toBe("1");
            expect(globalThis.localStorage.length).toBe(1);
            expect(globalThis.localStorage.key(0)).toBe("a");
            globalThis.localStorage.removeItem("a");
            expect(globalThis.localStorage.getItem("a")).toBeNull();

            globalThis.sessionStorage.setItem("b", "2");
            expect(globalThis.sessionStorage.getItem("b")).toBe("2");
            globalThis.sessionStorage.clear();
            expect(globalThis.sessionStorage.length).toBe(0);
        });

        it("does not clobber an already-present localStorage", async () => {
            originalLocalStorage = globalThis.localStorage;
            originalSessionStorage = globalThis.sessionStorage;
            const marker = { isMarker: true } as unknown as Storage;
            globalThis.localStorage = marker;

            await importPolyfills();

            expect(globalThis.localStorage).toBe(marker);
        });
    });

    describe("matchMedia stub", () => {
        let original: typeof window.matchMedia;

        afterEach(() => {
            window.matchMedia = original;
        });

        it("installs a stub MediaQueryList-shaped function when matchMedia is missing", async () => {
            original = window.matchMedia;
            // @ts-expect-error simulating jsdom's lack of matchMedia support
            delete window.matchMedia;

            await importPolyfills();

            expect(typeof window.matchMedia).toBe("function");
            const mql = window.matchMedia("(prefers-color-scheme: dark)");
            expect(mql.matches).toBe(false);
            expect(mql.media).toBe("(prefers-color-scheme: dark)");
            expect(mql.onchange).toBeNull();
            expect(mql.dispatchEvent(new Event("change"))).toBe(false);
            // Listener methods must exist and be callable no-ops (real code registers
            // theme-change listeners against whatever matchMedia() returns).
            expect(() => mql.addEventListener("change", () => {})).not.toThrow();
            expect(() => mql.removeEventListener("change", () => {})).not.toThrow();
            expect(() => mql.addListener(() => {})).not.toThrow();
            expect(() => mql.removeListener(() => {})).not.toThrow();
        });

        it("does not clobber an already-present matchMedia", async () => {
            original = window.matchMedia;
            const marker = vi.fn();
            window.matchMedia = marker as unknown as typeof window.matchMedia;

            await importPolyfills();

            expect(window.matchMedia).toBe(marker);
        });
    });

    it("is a safe no-op when window is not defined (guards a non-DOM Node run)", async () => {
        const originalLocalStorage = globalThis.localStorage;
        // @ts-expect-error simulating an environment with no Storage global
        delete globalThis.localStorage;
        vi.stubGlobal("window", undefined);

        try {
            await expect(importPolyfills()).resolves.toBeUndefined();
            expect(globalThis.localStorage).toBeUndefined();
        } finally {
            vi.unstubAllGlobals();
            globalThis.localStorage = originalLocalStorage;
        }
    });
});
