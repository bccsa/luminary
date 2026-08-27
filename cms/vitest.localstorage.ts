// jsdom exposes localStorage on some Node versions and not others, and where it
// does, its Storage is a Proxy whose methods sit on the prototype — so vi.spyOn
// cannot attach to them and a spy silently records nothing. Install the in-memory
// shim unconditionally so tests behave the same on every Node version.
// Loaded before vitest.setup.ts.
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

// jsdom defines localStorage as a getter on the window, so a plain assignment
// would not take.
Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
});
