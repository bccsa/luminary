// Node 26's jsdom doesn't expose localStorage, so every module that reads it at
// load time (globalConfig.ts, shared's database.ts) crashes before any test runs.
// Provide a minimal in-memory shim. Loaded before vitest.setup.ts.
// ponytail: in-memory Storage; swap for a real impl only if a test needs cross-realm persistence.
if (typeof globalThis.localStorage === "undefined") {
    const store = new Map<string, string>();
    const storage: Storage = {
        get length() {
            return store.size;
        },
        clear: () => store.clear(),
        getItem: (k) => (store.has(k) ? store.get(k)! : null),
        key: (i) => [...store.keys()][i] ?? null,
        removeItem: (k) => void store.delete(k),
        setItem: (k, v) => void store.set(k, String(v)),
    };
    globalThis.localStorage = storage;
}
