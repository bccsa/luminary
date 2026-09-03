import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import Dexie from "dexie";
import { db, dbUpgradeBlocked, getDbVersion, initDatabase } from "./database";
import { initConfig } from "../config";

// The boot-path database opens run before the app is mounted, so a failure that is only
// logged strands the user on the boot splash with nothing reported. A *blocked* open is
// not a failure: it clears itself when the other connection closes.
const originalIndexedDb = globalThis.indexedDB;

function stubOpen(fire: "onsuccess" | "onblocked" | "onerror") {
    const request: Record<string, ((event?: unknown) => void) | undefined> = {};
    (globalThis as any).indexedDB = {
        open: () => {
            setTimeout(() => {
                if (fire === "onsuccess") {
                    request.onsuccess?.({
                        target: { result: { version: 70, addEventListener() {}, close() {} } },
                    });
                } else {
                    request[fire]?.();
                }
            }, 0);
            return request;
        },
    };
    return request;
}

describe("getDbVersion", () => {
    afterEach(() => {
        dbUpgradeBlocked.value = false;
        (globalThis as any).indexedDB = originalIndexedDb;
    });

    it("resolves the version when the open succeeds", async () => {
        stubOpen("onsuccess");
        await expect(getDbVersion()).resolves.toBe(70);
    });

    it("rejects when the open errors", async () => {
        stubOpen("onerror");
        await expect(getDbVersion()).rejects.toThrow(/error/i);
    });

    it("treats a blocked open as a wait, not a failure", async () => {
        const request = stubOpen("onblocked");
        let settled = false;
        const pending = getDbVersion().then((v) => {
            settled = true;
            return v;
        });

        await new Promise((r) => setTimeout(r, 5));

        // Still waiting on the other connection, and saying so rather than throwing.
        expect(settled).toBe(false);
        expect(dbUpgradeBlocked.value).toBe(true);

        // The other connection closes; the browser then completes the same request.
        request.onsuccess?.({
            target: { result: { version: 70, addEventListener() {}, close() {} } },
        });

        await expect(pending).resolves.toBe(70);
        expect(dbUpgradeBlocked.value).toBe(false);
    });
});

describe("initDatabase", () => {
    afterEach(() => vi.restoreAllMocks());

    it("rejects when the database open fails", async () => {
        initConfig({
            cms: false,
            docsIndex: "[type+postType]",
            apiUrl: "http://localhost:12345",
        });
        vi.spyOn(Dexie.prototype, "open").mockRejectedValue(new Error("VersionError"));

        await expect(initDatabase()).rejects.toThrow("VersionError");
    });
});

// Dexie's own versionchange default closes the connection so the other tab can upgrade.
// That is enough for a background tab; the one the user is looking at is running code built
// for the old schema, so it reloads onto the new version.
describe("versionchange", () => {
    const originalLocation = window.location;
    let reload: ReturnType<typeof vi.fn>;

    const setVisibility = (value: "visible" | "hidden") =>
        Object.defineProperty(document, "visibilityState", { value, configurable: true });

    beforeEach(() => {
        reload = vi.fn();
        // jsdom's own location.reload throws "not implemented", and is not configurable.
        Object.defineProperty(window, "location", { configurable: true, value: { reload } });
    });

    afterEach(() => {
        Object.defineProperty(window, "location", {
            configurable: true,
            value: originalLocation,
        });
        setVisibility("visible");
        vi.restoreAllMocks();
    });

    async function openDb() {
        initConfig({ cms: false, docsIndex: "[type+postType]", apiUrl: "http://localhost:12345" });
        await initDatabase();
    }

    it("closes without reloading a hidden tab", async () => {
        await openDb();
        const close = vi.spyOn(db, "close");
        setVisibility("hidden");

        db.on("versionchange").fire({ newVersion: 99 });

        expect(close).toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });

    it("reloads the visible tab onto the new version", async () => {
        await openDb();
        const close = vi.spyOn(db, "close");
        setVisibility("visible");

        db.on("versionchange").fire({ newVersion: 99 });

        expect(close).toHaveBeenCalled();
        expect(reload).toHaveBeenCalled();
    });
});
