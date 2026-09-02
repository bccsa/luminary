import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi } from "vitest";
import Dexie from "dexie";
import { getDbVersion, initDatabase } from "./database";
import { initConfig } from "../config";

// The boot-path database opens run before the app is mounted, so a promise that never
// settles here strands the user on the boot splash with nothing reported.
const originalIndexedDb = globalThis.indexedDB;

function stubOpen(fire: "onsuccess" | "onblocked" | "onerror" | "never") {
    const request: Record<string, ((event?: unknown) => void) | undefined> = {};
    (globalThis as any).indexedDB = {
        open: () => {
            if (fire !== "never") {
                setTimeout(() => {
                    if (fire === "onsuccess") {
                        request.onsuccess?.({
                            target: { result: { version: 70, addEventListener() {}, close() {} } },
                        });
                    } else {
                        request[fire]?.();
                    }
                }, 0);
            }
            return request;
        },
    };
}

describe("getDbVersion", () => {
    afterEach(() => {
        vi.useRealTimers();
        (globalThis as any).indexedDB = originalIndexedDb;
    });

    it("resolves the version when the open succeeds", async () => {
        stubOpen("onsuccess");
        await expect(getDbVersion()).resolves.toBe(70);
    });

    it("rejects when the open is blocked by another connection", async () => {
        stubOpen("onblocked");
        await expect(getDbVersion()).rejects.toThrow(/blocked/i);
    });

    it("rejects when the open errors", async () => {
        stubOpen("onerror");
        await expect(getDbVersion()).rejects.toThrow(/error/i);
    });

    it("rejects when the open never answers at all", async () => {
        vi.useFakeTimers();
        stubOpen("never");

        const assertion = expect(getDbVersion()).rejects.toThrow(/timed out/i);
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;
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
