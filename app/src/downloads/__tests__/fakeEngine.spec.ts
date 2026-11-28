import { describe, expect, it, vi } from "vitest";
import type {
    DownloadStartRequest,
    DownloadsEngineEvents,
} from "@/build-time/contracts/downloads/contract";
import { createFakeEngine, FAKE_OPTIONS } from "../fakeEngine";
import { buildTimeline } from "../fakeTimeline";

const request = (overrides: Partial<DownloadStartRequest> = {}): DownloadStartRequest => ({
    downloadId: "d1",
    parentId: "post-1",
    parentType: "post",
    source: {
        masterUrl: "https://cdn.example.org/m.m3u8",
        keyHex: "ab".repeat(16),
        artworkUrls: [],
    },
    selection: { kind: "audio", audioLanguage: "en" },
    chapterIndices: [0, 1, 2],
    content: {
        title: "Item",
        contentId: "c1",
        language: "lang-eng",
        memberOf: [],
        durationSeconds: 0,
    },
    texts: { title: "Item" },
    volumeId: "internal",
    meteredConsent: false,
    expiresAt: null,
    ...overrides,
});

describe("the timeline rules", () => {
    const timeline = buildTimeline(
        [
            { fullStart: 0, fullEnd: 8, localStart: 0 },
            { fullStart: 20, fullEnd: 72, localStart: 8 },
        ],
        80,
        new Set(["a", "c"]),
    );

    it("toLocal", () => {
        expect(timeline.toLocal(7.5)).toEqual({ local: 7.5, exact: true });
        expect(timeline.toLocal(8)).toEqual({ local: 8, exact: false });
        expect(timeline.toLocal(12)).toEqual({ local: 8, exact: false });
        expect(timeline.toLocal(20)).toEqual({ local: 8, exact: true });
        expect(timeline.toLocal(72)).toEqual({ local: 0, exact: false });
        expect(buildTimeline([], 80, new Set()).toLocal(5)).toBeUndefined();
    });

    it("toFull", () => {
        expect(timeline.toFull(7.999)).toBeCloseTo(7.999);
        expect(timeline.toFull(8)).toBe(20);
        expect(timeline.toFull(19.5)).toBe(31.5);
        expect(timeline.toFull(65)).toBe(72);
        expect(timeline.toFull(-1)).toBe(0);
    });

    it("resumeLocal", () => {
        expect([5, 65, 12, 75, 40].map((p) => timeline.resumeLocal(p))).toEqual([0, 23, 8, 0, 8]);
    });

    it("chapter", () => {
        expect(timeline.chapter({ startTime: 0, endTime: 6, unitIds: ["a"] })).toEqual({
            startTime: 0,
            endTime: 6,
            available: true,
        });
        expect(timeline.chapter({ startTime: 6, endTime: 14, unitIds: ["b"] })).toEqual({
            startTime: 8,
            endTime: 8,
            available: false,
        });
        expect(timeline.chapter({ startTime: 22, endTime: 72, unitIds: ["c"] })).toEqual({
            startTime: 10,
            endTime: 60,
            available: true,
        });
        expect(timeline.chapter({ startTime: 72, endTime: 80, unitIds: ["d"] })).toEqual({
            startTime: 60,
            endTime: 60,
            available: false,
        });
        expect(timeline.localDuration).toBe(60);
    });
});

describe("createFakeEngine", () => {
    it("moves a started download from queued through downloading to complete", async () => {
        const engine = createFakeEngine();
        const statuses: string[] = [];
        engine.on("entry", (entry) => statuses.push(entry.status));
        const entry = await engine.start(request());
        expect(entry.status).toBe("queued");
        expect(entry.units.map((u) => u.unitId)).toEqual(["u0", "u1", "u2"]);
        for (let i = 0; i < 4; i++) engine.tick();
        expect(engine.entry("d1")?.status).toBe("complete");
        expect(engine.entry("d1")?.completedAt).not.toBeNull();
        expect(statuses).toContain("downloading");
        expect(statuses.at(-1)).toBe("complete");
    });

    it("plans only the chosen chapters and adds more to the same download", async () => {
        const engine = createFakeEngine();
        await engine.start(request({ chapterIndices: [1] }));
        expect(engine.entry("d1")?.chapters.map((c) => c.unitIds)).toEqual([[], ["u1"], []]);
        engine.tick();
        engine.tick();
        expect(engine.entry("d1")?.status).toBe("complete");
        await engine.start(request({ chapterIndices: [0, 1] }));
        expect(engine.entry("d1")?.status).toBe("downloading");
        expect(engine.entry("d1")?.chapters.map((c) => c.unitIds)).toEqual([["u0"], ["u1"], []]);
    });

    it("refuses a second download of the same parent and one that does not fit", async () => {
        const engine = createFakeEngine();
        await engine.start(request());
        await expect(engine.start(request({ downloadId: "d2" }))).rejects.toMatchObject({
            code: "already-exists",
        });
        engine.setFreeBytes(1);
        await expect(
            engine.start(request({ downloadId: "d3", parentId: "post-3" })),
        ).rejects.toMatchObject({ code: "no-space" });
    });

    it("waits for Wi-Fi without consent and goes on with it", async () => {
        const engine = createFakeEngine({ network: { metered: true } });
        await engine.start(request());
        expect(engine.entry("d1")).toMatchObject({ status: "waiting", reason: "metered" });
        await engine.resume("d1", { meteredConsent: true });
        expect(engine.entry("d1")?.status).toBe("downloading");
    });

    it("records the sheet and reports the viewer's actions with its id", async () => {
        const engine = createFakeEngine();
        const actions: DownloadsEngineEvents["sheetAction"][] = [];
        engine.on("sheetAction", (action) => actions.push(action));
        const model = {
            ...FAKE_OPTIONS,
            sheetId: "s1",
            phase: "ready" as const,
            title: "Item",
            chapters: [],
            selection: { kind: "audio" as const, audioLanguage: "en" },
            locked: false,
            sparsePlayback: true,
            appLanguage: "",
            volumes: [],
            freeBytes: 0,
            reserveBytes: 0,
            reclaimableBytes: 0,
            metered: false,
            existing: [],
        };
        await engine.presentSheet(model);
        expect(engine.sheet.value?.model.sheetId).toBe("s1");
        engine.act({ action: "pause" });
        expect(actions).toEqual([{ action: "pause", sheetId: "s1" }]);
        engine.act({ action: "dismissed" });
        expect(engine.sheet.value).toBeNull();
    });

    it("defers the next source check, then replaces the chapter on the one after", async () => {
        const engine = createFakeEngine();
        await engine.start(request());
        for (let i = 0; i < 4; i++) engine.tick();
        engine.deferNextCheck();
        const deferred = await engine.checkSource("d1", request().source);
        expect(deferred.deferredChapters).toEqual([0]);
        expect(engine.entry("d1")?.status).toBe("complete");
        const replaced = await engine.checkSource("d1", request().source);
        expect(replaced.replacedChapters).toEqual([0]);
        expect(engine.entry("d1")?.status).toBe("downloading");
    });

    it("opens a session with a timeline of the done chapters and stops it on revocation", async () => {
        const engine = createFakeEngine();
        await engine.start(request({ chapterIndices: [0, 2] }));
        for (let i = 0; i < 3; i++) engine.tick();
        const session = await engine.openPlayback("d1");
        expect(session.masterUrl).toBe("https://cdn.example.org/m.m3u8");
        expect(session.timeline.spans).toEqual([
            { fullStart: 0, fullEnd: 600, localStart: 0 },
            { fullStart: 1500, fullEnd: 1800, localStart: 600 },
        ]);
        expect(session.timeline.fullDuration).toBe(1800);

        const closed = vi.fn();
        engine.on("playbackClosed", closed);
        await engine.revoke("d1", "access");
        expect(closed).toHaveBeenCalledWith({
            playbackId: session.playbackId,
            downloadId: "d1",
            reason: "revoked",
        });
        expect(engine.entry("d1")).toMatchObject({ status: "revoked", key: "shredded" });
        await expect(engine.openPlayback("d1")).rejects.toMatchObject({ code: "revoked" });
        await engine.restore("d1", "cd".repeat(16));
        expect(engine.entry("d1")).toMatchObject({ status: "complete", key: "present" });
    });

    it("refuses to remove a download being played and removes it once released", async () => {
        const engine = createFakeEngine();
        await engine.start(request());
        for (let i = 0; i < 4; i++) engine.tick();
        const session = await engine.openPlayback("d1");
        expect(await engine.remove(["d1"])).toEqual([
            { downloadId: "d1", removed: false, code: "locked", freedBytes: 0 },
        ]);
        engine.closeSession(session.playbackId);
        const [result] = await engine.remove(["d1"]);
        expect(result.removed).toBe(true);
        expect(engine.entry("d1")).toBeUndefined();
    });

    it("reports a session released by the player or closed by the page, and only once", async () => {
        const engine = createFakeEngine();
        await engine.start(request());
        for (let i = 0; i < 4; i++) engine.tick();
        const released = vi.fn();
        const closed = vi.fn();
        engine.on("playbackReleased", released);
        engine.on("playbackClosed", closed);
        const first = await engine.openPlayback("d1");
        engine.closeSession(first.playbackId);
        expect(released).toHaveBeenLastCalledWith({
            playbackId: first.playbackId,
            downloadId: "d1",
        });
        const second = await engine.openPlayback("d1");
        await engine.closePlayback(second.playbackId);
        await engine.closePlayback(second.playbackId);
        expect(released).toHaveBeenLastCalledWith({
            playbackId: second.playbackId,
            downloadId: "d1",
        });
        expect(released).toHaveBeenCalledTimes(2);
        // A session the engine stops itself is closed, not released.
        const third = await engine.openPlayback("d1");
        engine.closeSession(third.playbackId, "removed");
        expect(released).toHaveBeenCalledTimes(2);
        expect(closed).toHaveBeenCalledWith({
            playbackId: third.playbackId,
            downloadId: "d1",
            reason: "removed",
        });
    });

    it("deletes on an update after which the expiry has passed, and keeps one whose passed expiry it clears", async () => {
        const engine = createFakeEngine();
        const removed = vi.fn();
        engine.on("removed", removed);
        await engine.start(request({ expiresAt: Date.now() - 1_000 }));
        await engine.start(request({ downloadId: "d2", parentId: "post-2" }));
        for (let i = 0; i < 4; i++) engine.tick();

        expect((await engine.update("d1", { expiresAt: null })).expiresAt).toBeNull();
        expect(engine.entry("d1")).toBeDefined();

        const passed = Date.now() - 1_000;
        const last = await engine.update("d2", { expiresAt: passed });
        expect(last.expiresAt).toBe(passed);
        expect(engine.entry("d2")).toBeUndefined();
        expect(removed).toHaveBeenCalledWith({
            downloadId: "d2",
            parentId: "post-2",
            reason: "expired",
        });
    });

    it("cancels pending chapters, and removes a download with none done", async () => {
        const engine = createFakeEngine();
        await engine.start(request());
        expect(await engine.cancel("d1")).toBeNull();
        expect(engine.entry("d1")).toBeUndefined();

        await engine.start(request({ downloadId: "d2" }));
        engine.tick();
        engine.tick();
        const kept = await engine.cancel("d2");
        expect(kept?.status).toBe("complete");
        expect(kept?.chapters.map((c) => c.unitIds)).toEqual([["u0"], [], []]);
    });

    it("reports a card going out and stops a session playing from it", async () => {
        const engine = createFakeEngine({ card: true });
        await engine.start(request({ volumeId: "card-1" }));
        for (let i = 0; i < 4; i++) engine.tick();
        const session = await engine.openPlayback("d1");
        const storage = vi.fn();
        const closed = vi.fn();
        engine.on("storage", storage);
        engine.on("playbackClosed", closed);
        engine.setMounted("card-1", false);
        expect(storage.mock.calls[0][0].volumes[1].mounted).toBe(false);
        expect(closed).toHaveBeenCalledWith({
            playbackId: session.playbackId,
            downloadId: "d1",
            reason: "volume-unavailable",
        });
    });
});
