import { DocType } from "../types";

type memStoreEntry = Map<string, any>;
type ListEntry = { key: string; value: string };
// Memory store
export const memStore: Map<string, memStoreEntry> = new Map();
// Class managing memory store
export let memoryStore: MemoryStore;

class MemoryStore {
    store: any;
    constructor() {}

    // ==================
    // General
    /**
     * Initialize a store for a document type
     * @param type - DocType, type of document
     */
    initStore(type: DocType) {
        if (!memStore.has(type)) {
            memStore.set(type, new Map());
        }
    }

    // ==================
    // Setters
    /**
     * Set a single value in store
     * @param type - DocType, type of document
     * @param key - key to store
     * @param value - value to store
     */
    set(type: DocType, key: string, value: string) {
        this.initStore(type);
        const store = memStore.get(type);
        store?.set(key, value);
    }

    /**
     * Set a list of key value pairs in store
     * @param type - DocType, type of document
     * @param list - List of key value pairs
     */
    setList(type: DocType, list: Array<ListEntry>) {
        this.initStore(type);
        list.forEach((item: ListEntry) => {
            this.set(type, item.key, item.value);
        });
    }

    // ==================
    // Getters
    /**
     * Return a single value from store
     * @param type - DocType, type of document
     * @param key - key to get
     * @returns
     */
    get(type: DocType, key: string) {
        this.initStore(type);
        const store = memStore.get(type);
        return store?.get(key);
    }

    /**
     * Return all values from store
     * @param type - DocType, type of document
     * @returns
     */
    getStore(type: DocType) {
        this.initStore(type);
        return memStore.get(type);
    }

    // ==================
    // Deleters
    /**
     * Remove a single value from store
     * @param type - DocType, type of document
     * @param key - key to remove
     */
    remove(type: DocType, key: string) {
        this.initStore(type);
        const store = memStore.get(type);
        store?.delete(key);
    }

    /**
     * Remove all values from store
     * @param type - DocType, type of document
     */
    removeStore(type: DocType) {
        this.initStore(type);
        memStore.delete(type);
    }
}

export const initMemStore = () => {
    memoryStore = new MemoryStore();
};
