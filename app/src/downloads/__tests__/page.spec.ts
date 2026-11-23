import { describe, expect, it } from "vitest";
import type { DownloadVolume } from "@/build-time/contracts/downloads/contract";
import { cardView, chapterCount, freedBytes, sortDownloads } from "../page";
import { makeEntry } from "./helpers";

const volume = (id: string, mounted: boolean): DownloadVolume => ({
    id,
    kind: id === "internal" ? "internal" : "card",
    label: id,
    mounted,
    totalBytes: 100,
    freeBytes: 50,
    downloadsBytes: 0,
    reclaimable: { orphans: 0, staging: 0, unreferenced: 0, expired: 0 },
});
const volumes = [volume("internal", true), volume("card-1", false)];
const add = { canAddChapters: true };
const partialChapters = [
    { title: "A", startTime: 0, endTime: 10, unitIds: ["u0"] },
    { title: "B", startTime: 10, endTime: 20, unitIds: [] },
];

describe("sortDownloads", () => {
    const small = makeEntry({
        downloadId: "small",
        createdAt: 3,
        item: { state: "done", bytes: 1 },
    });
    const big = makeEntry({
        downloadId: "big",
        createdAt: 1,
        units: [{ unitId: "u0", state: "pending", bytes: 5000 }],
    });
    const mid = makeEntry({ downloadId: "mid", createdAt: 2 });

    it("orders by newest, oldest or largest planned size", () => {
        const ids = (order: "newest" | "oldest" | "largest") =>
            sortDownloads([mid, small, big], order).map((e) => e.downloadId);
        expect(ids("newest")).toEqual(["small", "mid", "big"]);
        expect(ids("oldest")).toEqual(["big", "mid", "small"]);
        expect(ids("largest")).toEqual(["big", "mid", "small"]);
    });
});

describe("freedBytes", () => {
    it("adds what each download has stored, leaving out those skipped", () => {
        const done = makeEntry({ downloadId: "a" });
        const half = makeEntry({
            downloadId: "b",
            units: [
                { unitId: "u0", state: "done", bytes: 100 },
                { unitId: "u1", state: "pending", bytes: 100 },
            ],
        });
        expect(freedBytes([done, half], new Set())).toBe(210 + 110);
        expect(freedBytes([done, half], new Set(["a"]))).toBe(110);
    });
});

describe("chapterCount", () => {
    it("counts done chapters of all, and has nothing for an item without chapters", () => {
        expect(
            chapterCount(
                makeEntry({
                    units: [
                        { unitId: "u0", state: "done", bytes: 1 },
                        { unitId: "u1", state: "pending", bytes: 1 },
                    ],
                }),
            ),
        ).toEqual({ done: 1, total: 2 });
        expect(chapterCount(makeEntry({ chapters: [] }))).toBeUndefined();
    });
});

describe("cardView", () => {
    it("offers only removal for a revoked download, saying why and what restores it", () => {
        expect(cardView(makeEntry({ status: "revoked", reason: "access" }), volumes, add)).toEqual({
            attention: "downloads.page.attention.revoked_access",
            actions: ["remove"],
        });
    });

    it("offers only removal on a card that is not inserted", () => {
        expect(cardView(makeEntry({ volumeId: "card-1" }), volumes, add)).toEqual({
            attention: "downloads.page.attention.card_unmounted",
            actions: ["remove"],
        });
    });

    it("offers adding chapters to a partial download only when allowed", () => {
        const partial = makeEntry({ chapters: partialChapters });
        expect(cardView(partial, volumes, add).actions).toEqual(["addChapters", "remove"]);
        expect(cardView(partial, volumes, { canAddChapters: false }).actions).toEqual(["remove"]);
        expect(cardView(makeEntry(), volumes, add).actions).toEqual(["remove"]);
    });

    it("asks for the key again first when it is missing", () => {
        expect(cardView(makeEntry({ key: "missing" }), volumes, add)).toEqual({
            attention: "downloads.page.attention.key_missing",
            actions: ["fetchKey", "remove"],
        });
    });

    it("pauses and stops a transfer, and offers mobile data while waiting for Wi-Fi", () => {
        for (const status of ["queued", "downloading"] as const) {
            const entry = makeEntry({
                status,
                units: [{ unitId: "u0", state: "pending", bytes: 1 }],
            });
            expect(cardView(entry, volumes, add)).toEqual({
                attention: null,
                actions: ["pause", "cancel", "remove"],
            });
        }
        const metered = makeEntry({
            status: "waiting",
            reason: "metered",
            units: [{ unitId: "u0", state: "pending", bytes: 1 }],
        });
        expect(cardView(metered, volumes, add)).toEqual({
            attention: "downloads.page.attention.metered",
            actions: ["useMobileData", "pause", "cancel", "remove"],
        });
    });

    it("shows a refreshing download as downloaded, with no resume of any kind", () => {
        const refreshing = makeEntry({ status: "waiting", reason: "metered" });
        expect(cardView(refreshing, volumes, add)).toEqual({
            attention: null,
            actions: ["remove"],
        });
    });

    it("resumes a paused download, saying why when the viewer did not pause it", () => {
        const pending = [{ unitId: "u0", state: "pending" as const, bytes: 1 }];
        const paused = (reason: "user" | "no-space" | "interrupted") =>
            cardView(makeEntry({ status: "paused", reason, units: pending }), volumes, add);
        expect(paused("user")).toEqual({
            attention: null,
            actions: ["resume", "cancel", "remove"],
        });
        expect(paused("no-space").attention).toBe("downloads.page.attention.no_space");
        expect(paused("interrupted").attention).toBe("downloads.page.attention.interrupted");
    });

    it("retries a failed download, saying why by its reason", () => {
        const failed = (reason: "source-changed" | "source-gone" | "integrity" | "http" | null) =>
            cardView(makeEntry({ status: "failed", reason }), volumes, add);
        expect(failed("http").actions).toEqual(["retry", "cancel", "remove"]);
        expect(failed("source-changed").attention).toBe("downloads.page.attention.source_changed");
        expect(failed("source-gone").attention).toBe("downloads.page.attention.source_gone");
        expect(failed("integrity").attention).toBe("downloads.page.attention.integrity");
        expect(failed("http").attention).toBe("downloads.page.attention.http");
        expect(failed(null).attention).toBe("downloads.page.attention.failed");
    });
});
