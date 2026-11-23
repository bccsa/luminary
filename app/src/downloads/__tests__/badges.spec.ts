import { describe, expect, it } from "vitest";
import type {
    DownloadProgress,
    DownloadReason,
    DownloadVolume,
} from "@/build-time/contracts/downloads/contract";
import { badgeFor, isRefreshing, needsAttention } from "../badges";
import { makeEntry } from "./helpers";

const volume = (id: string, mounted: boolean): DownloadVolume => ({
    id,
    kind: id === "internal" ? "internal" : "card",
    label: id,
    mounted,
    totalBytes: 1,
    freeBytes: 1,
    downloadsBytes: 0,
    reclaimable: { orphans: 0, staging: 0, unreferenced: 0, expired: 0 },
});
const mounted = [volume("internal", true), volume("card-1", true)];
const progress = (bytesDone: number, bytesTotal: number): DownloadProgress => ({
    downloadId: "d1",
    bytesDone,
    bytesTotal,
    bytesPerSecond: 0,
    units: {},
});
const pending = {
    item: { state: "done" as const, bytes: 10 },
    units: [
        { unitId: "u0", state: "done" as const, bytes: 100 },
        { unitId: "u1", state: "pending" as const, bytes: 100 },
    ],
};
const allDone = {
    item: { state: "done" as const, bytes: 10 },
    units: [
        { unitId: "u0", state: "done" as const, bytes: 100 },
        { unitId: "u1", state: "done" as const, bytes: 100 },
    ],
};

describe("badgeFor", () => {
    it("rule 1: no entry is none", () => {
        expect(badgeFor(undefined, undefined, mounted)).toEqual({ state: "none" });
    });

    it("rule 1: a revoked entry is none", () => {
        const entry = makeEntry({ status: "revoked", reason: "access", key: "shredded" });
        expect(badgeFor(entry, undefined, mounted)).toEqual({ state: "none" });
    });

    it("rule 2: an entry on an unmounted volume is unavailable", () => {
        const entry = makeEntry({ status: "downloading", ...pending, volumeId: "card-1" });
        const volumes = [volume("internal", true), volume("card-1", false)];
        expect(badgeFor(entry, progress(1, 2), volumes)).toEqual({ state: "unavailable" });
    });

    it("rule 3: a key missing needs attention", () => {
        const entry = makeEntry({ key: "missing" });
        expect(badgeFor(entry, undefined, mounted)).toEqual({ state: "attention" });
    });

    it("rule 3: a paused download for no space needs attention", () => {
        const entry = makeEntry({ status: "paused", reason: "no-space", ...pending });
        expect(badgeFor(entry, progress(1, 2), mounted)).toEqual({ state: "attention" });
    });

    it("rule 4: a refreshing download shows as downloaded", () => {
        const entry = makeEntry({ status: "downloading", ...allDone });
        expect(isRefreshing(entry)).toBe(true);
        expect(badgeFor(entry, progress(210, 211), mounted)).toEqual({
            state: "downloaded",
            partial: false,
        });
    });

    it("rule 5: queued, downloading, waiting and paused show progress", () => {
        for (const [status, reason] of [
            ["queued", null],
            ["downloading", null],
            ["waiting", "network"],
            ["paused", "user"],
        ] as const) {
            const entry = makeEntry({ status, reason, ...pending });
            expect(badgeFor(entry, progress(55, 100), mounted)).toEqual({
                state: "progress",
                percent: 55,
            });
        }
    });

    it("rule 6: complete is downloaded, partial when some chapter has no unit", () => {
        expect(badgeFor(makeEntry(), undefined, mounted)).toEqual({
            state: "downloaded",
            partial: false,
        });
        const partial = makeEntry({
            units: [{ unitId: "u0", state: "done", bytes: 100 }],
            chapters: [
                { title: "A", startTime: 0, endTime: 10, unitIds: ["u0"] },
                { title: "B", startTime: 10, endTime: 20, unitIds: [] },
            ],
        });
        expect(badgeFor(partial, undefined, mounted)).toEqual({
            state: "downloaded",
            partial: true,
        });
    });

    it("a failed download needs attention whatever its reason", () => {
        const reasons: DownloadReason[] = [
            "network",
            "metered",
            "volume",
            "user",
            "no-space",
            "interrupted",
            "source-changed",
            "source-gone",
            "integrity",
            "http",
            "access",
        ];
        for (const reason of reasons) {
            const entry = makeEntry({ status: "failed", reason, ...pending });
            expect(badgeFor(entry, progress(1, 2), mounted)).toEqual({ state: "attention" });
        }
    });

    it("waiting for the network shows progress, waiting for Wi-Fi needs attention", () => {
        const network = makeEntry({ status: "waiting", reason: "network", ...pending });
        const metered = makeEntry({ status: "waiting", reason: "metered", ...pending });
        expect(badgeFor(network, progress(1, 4), mounted)).toEqual({
            state: "progress",
            percent: 25,
        });
        expect(badgeFor(metered, progress(1, 4), mounted)).toEqual({ state: "attention" });
    });

    it("a refreshing download waiting for Wi-Fi is downloaded, a paused one with every unit done is progress", () => {
        const refreshing = makeEntry({ status: "waiting", reason: "metered", ...allDone });
        expect(needsAttention(refreshing)).toBe(false);
        expect(badgeFor(refreshing, undefined, mounted)).toEqual({
            state: "downloaded",
            partial: false,
        });

        const refreshingPartial = makeEntry({
            status: "waiting",
            reason: "metered",
            item: { state: "done", bytes: 10 },
            units: [{ unitId: "u0", state: "done", bytes: 100 }],
            chapters: [
                { title: "A", startTime: 0, endTime: 10, unitIds: ["u0"] },
                { title: "B", startTime: 10, endTime: 20, unitIds: [] },
            ],
        });
        expect(badgeFor(refreshingPartial, undefined, mounted)).toEqual({
            state: "downloaded",
            partial: true,
        });

        const paused = makeEntry({ status: "paused", reason: "user", ...allDone });
        expect(badgeFor(paused, progress(210, 210), mounted)).toEqual({
            state: "progress",
            percent: 100,
        });
    });

    it("a complete entry on an unmounted card is unavailable, ahead of downloaded", () => {
        const entry = makeEntry({ volumeId: "card-1" });
        const volumes = [volume("internal", true), volume("card-1", false)];
        expect(badgeFor(entry, undefined, volumes)).toEqual({ state: "unavailable" });
    });

    it("a revoked entry on an unmounted card is none", () => {
        const entry = makeEntry({ status: "revoked", reason: "access", volumeId: "card-1" });
        const volumes = [volume("internal", true), volume("card-1", false)];
        expect(badgeFor(entry, undefined, volumes)).toEqual({ state: "none" });
    });

    it("percent is floored: 0, 99.9 % as 99, and 100", () => {
        const entry = makeEntry({ status: "downloading", ...pending });
        expect(badgeFor(entry, undefined, mounted)).toEqual({ state: "progress", percent: 0 });
        expect(badgeFor(entry, progress(0, 1000), mounted)).toEqual({
            state: "progress",
            percent: 0,
        });
        expect(badgeFor(entry, progress(999, 1000), mounted)).toEqual({
            state: "progress",
            percent: 99,
        });
        expect(badgeFor(entry, progress(1000, 1000), mounted)).toEqual({
            state: "progress",
            percent: 100,
        });
    });
});
