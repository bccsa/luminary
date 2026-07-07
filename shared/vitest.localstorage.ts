// Node 26's jsdom doesn't expose a working localStorage, so every module that reads it at
// load time (database.ts) crashes before any test runs. Provide a minimal in-memory shim,
// loaded before vitest.setup.ts.
//
// Defined directly on `Storage.prototype` (not as own-properties on a plain object) so
// `vi.spyOn(Storage.prototype, "setItem")` — used by responseCache.spec.ts's quota-overflow
// tests — actually intercepts calls made through this shim; an object-literal shim would
// shadow the prototype and make that spy a no-op.
if (typeof globalThis.localStorage === "undefined" && typeof Storage !== "undefined") {
    const store = new Map<string, string>();
    Object.defineProperties(Storage.prototype, {
        length: { configurable: true, get: () => store.size },
        clear: { configurable: true, writable: true, value: () => store.clear() },
        getItem: {
            configurable: true,
            writable: true,
            value: (k: string) => (store.has(k) ? store.get(k)! : null),
        },
        key: {
            configurable: true,
            writable: true,
            value: (i: number) => [...store.keys()][i] ?? null,
        },
        removeItem: { configurable: true, writable: true, value: (k: string) => void store.delete(k) },
        setItem: {
            configurable: true,
            writable: true,
            value: (k: string, v: string) => void store.set(k, String(v)),
        },
    });
    globalThis.localStorage = Object.create(Storage.prototype) as Storage;
}
