// Node 26's jsdom doesn't expose localStorage, while the database reads it
// during module initialization. Provide the minimal Storage implementation
// needed by shared unit tests before their setup runs.
if (typeof globalThis.localStorage === "undefined") {
    const store = new Map<string, string>();
    const storage: Storage = {
        get length() {
            return store.size;
        },
        clear: () => store.clear(),
        getItem: (key) => (store.has(key) ? store.get(key)! : null),
        key: (index) => [...store.keys()][index] ?? null,
        removeItem: (key) => void store.delete(key),
        setItem: (key, value) => void store.set(key, String(value)),
    };
    globalThis.localStorage = storage;
}
