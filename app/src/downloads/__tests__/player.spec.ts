import { afterEach, describe, expect, it, vi } from "vitest";
import type { DownloadStartRequest } from "@/build-time/contracts/downloads/contract";
import { createFakeEngine, type FakeEngineOptions } from "../fakeEngine";
import { contentFromSnapshot, hasDownloadableMedia, snapshotFor } from "../content";
import { KEY_FETCH_INTERVAL_MS } from "../lifecycle";
import { MORE_READY_FOLD_MS } from "../player";
import { createDownloadsService, type DownloadsRuntime } from "../service";
import { flush, grantAll, makeContent, makeDeps, makeEntry, makeParent } from "./helpers";

const request = (overrides: Partial<DownloadStartRequest> = {}): DownloadStartRequest => ({
    downloadId: "d1",
    parentId: "post-1",
    parentType: "post",
    source: {
        masterUrl: "https://cdn.example.org/m.m3u8",
        keyHex: "ab".repeat(16),
        artworkUrls: ["https://cdn.example.org/a.jpg"],
    },
    selection: { kind: "audio", audioLanguage: "en" },
    chapterIndices: [0, 1, 2],
    content: {
        title: "Item one",
        contentId: "content-1",
        language: "lang-eng",
        memberOf: ["group-public"],
        durationSeconds: 0,
    },
    texts: { title: "Item one" },
    volumeId: "internal",
    meteredConsent: false,
    expiresAt: null,
    ...overrides,
});

let services: DownloadsRuntime[] = [];
afterEach(() => {
    services.forEach((s) => s.dispose());
    services = [];
    vi.useRealTimers();
});

async function setup(
    ticks: number,
    options: FakeEngineOptions = {},
    overrides: Partial<DownloadStartRequest> = {},
) {
    const fake = createFakeEngine(options);
    await fake.start(request(overrides));
    for (let i = 0; i < ticks; i++) fake.tick();
    const helpers = makeDeps();
    helpers.docs.set("post-1", makeParent());
    helpers.docs.set("content-1", makeContent());
    const service = createDownloadsService(fake, helpers.deps);
    services.push(service);
    await service.whenReady;
    return { fake, service, ...helpers };
}

const content = makeContent();

describe("player.open", () => {
    it("opens a playable download with the session's addresses and timeline", async () => {
        const { service } = await setup(4);
        const playback = await service.player.open(content, { preferOnline: false });
        expect(playback).toMatchObject({
            downloadId: "d1",
            masterUrl: "https://cdn.example.org/m.m3u8",
            keyHex: "ab".repeat(16),
            artworkUrl: "https://cdn.example.org/a.jpg",
        });
        expect(playback?.timeline.fullDuration).toBe(1800);
    });

    it("keeps the copy that plays when a second session of the item is closed unloaded", async () => {
        const { service } = await setup(4);
        const first = await service.player.open(content, { preferOnline: false });
        const second = await service.player.open(content, { preferOnline: false });
        expect(service.player.playing.value?.playbackId).toBe(second?.playbackId);
        await second!.close();
        expect(service.player.playing.value).toMatchObject({
            parentId: "post-1",
            playbackId: first?.playbackId,
        });
    });

    it("keeps a streamed item when a session of it is closed unloaded, so more ready still reaches it", async () => {
        vi.useFakeTimers();
        const { service, fake } = await setup(2);
        const more = vi.fn();
        service.player.onMoreReady(more);
        expect(await service.player.open(content, { preferOnline: true })).toBeNull();
        const declined = await service.player.open(content, { preferOnline: false });
        await declined!.close();
        expect(service.player.playing.value).toMatchObject({ parentId: "post-1" });
        expect(service.player.playing.value?.playbackId).toBeUndefined();

        fake.tick();
        await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
        expect(more).toHaveBeenCalledTimes(1);
    });

    it("forgets another item's session when a session is closed unloaded", async () => {
        const { service } = await setup(4);
        await service.player.open(makeContent({ parentId: "post-9" }), { preferOnline: false });
        const playback = await service.player.open(content, { preferOnline: false });
        await playback!.close();
        expect(service.player.playing.value).toBeNull();
    });

    it("returns null when there is no download", async () => {
        const { service } = await setup(4);
        expect(
            await service.player.open(makeContent({ parentId: "post-9" }), { preferOnline: false }),
        ).toBeNull();
    });

    it("returns null when no chapter is playable yet", async () => {
        const { service } = await setup(1);
        expect(await service.player.open(content, { preferOnline: false })).toBeNull();
    });

    it("returns null when the download's volume is not mounted", async () => {
        const { service, fake } = await setup(4, { card: true }, { volumeId: "card-1" });
        fake.setMounted("card-1", false);
        expect(await service.player.open(content, { preferOnline: false })).toBeNull();
    });

    it("returns null when the key is missing, and asks for the key ahead of anything else", async () => {
        vi.useFakeTimers();
        const fake = createFakeEngine();
        for (const n of [1, 2, 3]) {
            await fake.start(request({ downloadId: `d${n}`, parentId: `post-${n}` }));
        }
        for (let i = 0; i < 12; i++) fake.tick();
        await fake.revoke("d2", "access");
        await fake.revoke("d3", "access");
        const helpers = makeDeps();
        helpers.accessMap.value = {};
        const service = createDownloadsService(fake, helpers.deps);
        services.push(service);
        await service.whenReady;
        const fetchKey = vi.mocked(helpers.deps.fetchKey);
        // Both revoked downloads are queued; the first is fetched at once.
        helpers.accessMap.value = grantAll();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchKey.mock.calls.map((c) => c[0])).toEqual(["post-2"]);

        service.internals.state.applyEntry({ ...fake.entry("d1")!, key: "missing" });
        expect(await service.player.open(content, { preferOnline: false })).toBeNull();
        await vi.advanceTimersByTimeAsync(KEY_FETCH_INTERVAL_MS * 2);
        expect(fetchKey.mock.calls.map((c) => c[0])).toEqual(["post-2", "post-1", "post-3"]);
    });

    it("returns null when Online is chosen while online, and plays the download offline", async () => {
        const { service, fake } = await setup(4);
        expect(await service.player.open(content, { preferOnline: true })).toBeNull();
        fake.setNetwork({ online: false });
        expect(await service.player.open(content, { preferOnline: true })).not.toBeNull();
    });

    it("returns null for a revoked or expired download", async () => {
        const { service, fake } = await setup(4);
        service.internals.state.applyEntry({ ...fake.entry("d1")!, expiresAt: Date.now() - 1 });
        expect(await service.player.open(content, { preferOnline: false })).toBeNull();
        await fake.revoke("d1", "access");
        expect(await service.player.open(content, { preferOnline: false })).toBeNull();
    });

    it("streams when opening fails online, and lets the error through offline", async () => {
        const { service, fake } = await setup(4);
        vi.spyOn(fake, "openPlayback").mockRejectedValue(
            Object.assign(new Error("io"), { code: "io" }),
        );
        expect(await service.player.open(content, { preferOnline: false })).toBeNull();
        fake.setNetwork({ online: false });
        await expect(service.player.open(content, { preferOnline: false })).rejects.toMatchObject({
            code: "io",
        });
    });

    it("tells the viewer it streams when opening fails online, through the player's notice", async () => {
        const { service, fake, deps } = await setup(4);
        vi.spyOn(fake, "openPlayback").mockRejectedValue(
            Object.assign(new Error("io"), { code: "io" }),
        );
        const shown = vi.fn(() => true);
        service.player.onNotice(shown);

        expect(await service.player.open(content, { preferOnline: false })).toBeNull();

        expect(shown).toHaveBeenCalledWith("t:downloads.notice.streaming_fallback");
        expect(deps.notify).not.toHaveBeenCalled();
    });

    it("gives the fallback notice in English where the language lacks it, and none offline", async () => {
        const { service, fake, deps } = await setup(4);
        deps.translator = () => ({ t: (key: string) => key });
        vi.spyOn(fake, "openPlayback").mockRejectedValue(
            Object.assign(new Error("io"), { code: "io" }),
        );

        await service.player.open(content, { preferOnline: false });
        expect(deps.notify).toHaveBeenCalledWith(
            "Playing online: the download could not be played",
            "info",
        );

        vi.mocked(deps.notify).mockClear();
        fake.setNetwork({ online: false });
        await service.player.open(content, { preferOnline: false }).catch(() => undefined);
        expect(deps.notify).not.toHaveBeenCalled();
    });

    it("keeps the session that plays, and says nothing, when a switch to more of the item fails to open", async () => {
        const { service, fake, deps } = await setup(4);
        const first = await service.player.open(content, { preferOnline: false });
        vi.spyOn(fake, "openPlayback").mockRejectedValueOnce(
            Object.assign(new Error("io"), { code: "io" }),
        );
        const shown = vi.fn(() => true);
        service.player.onNotice(shown);

        expect(await service.player.open(content, { preferOnline: false })).toBeNull();

        expect(shown).not.toHaveBeenCalled();
        expect(deps.notify).not.toHaveBeenCalled();
        expect(service.player.playing.value).toMatchObject({
            parentId: "post-1",
            playbackId: first?.playbackId,
        });
    });

    it("keeps the session that plays when a switch to more of the item fails to open offline", async () => {
        const { service, fake } = await setup(4);
        const first = await service.player.open(content, { preferOnline: false });
        fake.setNetwork({ online: false });
        vi.spyOn(fake, "openPlayback").mockRejectedValueOnce(
            Object.assign(new Error("io"), { code: "io" }),
        );

        await expect(service.player.open(content, { preferOnline: false })).rejects.toMatchObject({
            code: "io",
        });

        expect(service.player.playing.value).toMatchObject({
            parentId: "post-1",
            playbackId: first?.playbackId,
        });
    });

    it("keeps the session that plays when a switch finds the download no longer playable", async () => {
        const { service, fake } = await setup(4);
        const first = await service.player.open(content, { preferOnline: false });
        service.internals.state.applyEntry({ ...fake.entry("d1")!, expiresAt: Date.now() - 1 });

        expect(await service.player.open(content, { preferOnline: false })).toBeNull();

        expect(service.player.playing.value).toMatchObject({
            parentId: "post-1",
            playbackId: first?.playbackId,
        });
    });

    it("puts back no session the engine closed while a switch to more of the item was opening", async () => {
        for (const online of [true, false]) {
            const { service, fake } = await setup(4);
            const first = await service.player.open(content, { preferOnline: false });
            if (!online) fake.setNetwork({ online: false });
            let fail!: (error: Error) => void;
            vi.spyOn(fake, "openPlayback").mockReturnValueOnce(new Promise((_, r) => (fail = r)));
            const second = service.player.open(content, { preferOnline: false });
            fake.closeSession(first!.playbackId, "revoked");
            fail(Object.assign(new Error("io"), { code: "io" }));
            await second.catch(() => undefined);

            expect(service.player.playing.value?.playbackId).toBeUndefined();
        }
    });

    it("says nothing when there is no download to play, or another item took over the open", async () => {
        const { service, fake, deps } = await setup(4);
        expect(
            await service.player.open(makeContent({ parentId: "post-9" }), {
                preferOnline: false,
            }),
        ).toBeNull();
        let fail!: (error: Error) => void;
        vi.spyOn(fake, "openPlayback").mockReturnValueOnce(new Promise((_, r) => (fail = r)));
        const first = service.player.open(content, { preferOnline: false });
        await service.player.open(makeContent({ parentId: "post-9" }), { preferOnline: false });
        fail(Object.assign(new Error("io"), { code: "io" }));

        expect(await first).toBeNull();
        expect(deps.notify).not.toHaveBeenCalled();
    });

    it("closes a session it opened when the player loaded something else meanwhile", async () => {
        const { service, fake } = await setup(4);
        const closePlayback = vi.spyOn(fake, "closePlayback");
        const first = service.player.open(content, { preferOnline: false });
        await service.player.open(makeContent({ parentId: "post-9" }), { preferOnline: false });
        expect(await first).toBeNull();
        expect(closePlayback).toHaveBeenCalledTimes(1);
    });

    it("reports the engine stopping a session itself", async () => {
        const { service, fake } = await setup(4);
        const closed = vi.fn();
        service.player.onClosed(closed);
        const playback = await service.player.open(content, { preferOnline: false });
        await fake.revoke("d1", "access");
        expect(closed).toHaveBeenCalledWith(playback?.playbackId, "revoked");
        // The item stays in the player, with no session of it playing.
        expect(service.player.playing.value).toMatchObject({ parentId: "post-1" });
        expect(service.player.playing.value?.playbackId).toBeUndefined();
    });
});

describe("deferred chapters when a session ends", () => {
    /** A download being played whose add was refused because its source changed. */
    async function deferredWhilePlaying() {
        const ctx = await setup(4);
        const playback = await ctx.service.player.open(content, { preferOnline: false });
        await flush();
        ctx.fake.deferNextCheck();
        await ctx.service.openSheet(content, { context: "player" });
        ctx.fake.act({
            action: "start",
            selection: { kind: "audio", audioLanguage: "en" },
            chapters: [0, 1, 2],
            meteredConsent: false,
        });
        await flush();
        await flush();
        expect(ctx.deps.notify).toHaveBeenCalledWith(
            "t:downloads.notice.updated_while_playing",
            "info",
        );
        const checkSource = vi.spyOn(ctx.fake, "checkSource");
        return { ...ctx, playback: playback!, checkSource };
    }

    it("checks again once the player closes the session", async () => {
        const { playback, checkSource, deps } = await deferredWhilePlaying();
        await playback.close();
        await flush();
        expect(checkSource).toHaveBeenCalledTimes(1);
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.chapters_replaced", "info");
    });

    it("checks again when the engine reports the session closed", async () => {
        const { playback, checkSource, fake, service } = await deferredWhilePlaying();
        fake.closeSession(playback.playbackId, "volume-unavailable");
        await flush();
        expect(checkSource).toHaveBeenCalledTimes(1);
        expect(service.player.playing.value).toMatchObject({ parentId: "post-1" });
        expect(service.player.playing.value?.playbackId).toBeUndefined();
    });

    it("checks again when the engine reports the session released after the player moved on", async () => {
        const { playback, checkSource, fake, service } = await deferredWhilePlaying();
        await service.player.open(makeContent({ parentId: "post-9" }), { preferOnline: false });
        await flush();
        expect(checkSource).not.toHaveBeenCalled();
        // The player releases the old session only after its new load; the engine reports it.
        fake.closeSession(playback.playbackId);
        await flush();
        expect(checkSource).toHaveBeenCalledTimes(1);
        expect(await checkSource.mock.results[0].value).toMatchObject({ replacedChapters: [0] });
    });

    it("runs no timed check after the player moves on, only the one the release brings", async () => {
        const { playback, checkSource, fake, service } = await deferredWhilePlaying();
        vi.useFakeTimers();
        await service.player.open(makeContent({ parentId: "post-9" }), { preferOnline: false });
        await vi.advanceTimersByTimeAsync(60_000);
        expect(checkSource).not.toHaveBeenCalled();
        fake.closeSession(playback.playbackId);
        await vi.advanceTimersByTimeAsync(0);
        expect(checkSource).toHaveBeenCalledTimes(1);
    });

    it("keeps the item, streamed now, when the engine reports the playing session released", async () => {
        const { playback, fake, service } = await deferredWhilePlaying();
        expect(service.player.playing.value?.playbackId).toBe(playback.playbackId);
        fake.closeSession(playback.playbackId);
        await flush();
        expect(service.player.playing.value).toMatchObject({ parentId: "post-1" });
        expect(service.player.playing.value?.playbackId).toBeUndefined();
    });

    it("keeps what plays now when an earlier session's release arrives late", async () => {
        const { playback, fake, service } = await deferredWhilePlaying();
        const next = await service.player.open(content, { preferOnline: false });
        expect(next?.playbackId).not.toBe(playback.playbackId);
        fake.closeSession(playback.playbackId);
        await flush();
        expect(service.player.playing.value?.playbackId).toBe(next?.playbackId);
    });
});

describe("player hooks the contract names", () => {
    it("reports the viewer's source pick and answers it as the override", async () => {
        const { service } = await setup(4);
        const chosen = vi.fn();
        const stop = service.player.onSourceChosen(chosen);
        expect(service.player.sourceOverride("post-1")).toBeUndefined();
        expect(await service.player.chooseSource("post-1", "online")).toBe(true);
        expect(chosen).toHaveBeenCalledWith("post-1", "online");
        expect(service.player.sourceOverride("post-1")).toBe("online");
        stop();
        expect(await service.player.chooseSource("post-1", "downloaded")).toBe(true);
        expect(chosen).toHaveBeenCalledTimes(1);
        expect(service.player.sourceOverride("post-1")).toBe("downloaded");
    });

    it("puts the override back when the player could not follow the pick", async () => {
        const { service } = await setup(4);
        const stop = service.player.onSourceChosen(async () => false);
        expect(await service.player.chooseSource("post-1", "downloaded")).toBe(false);
        expect(service.player.sourceOverride("post-1")).toBeUndefined();
        stop();
        await service.player.chooseSource("post-1", "online");
        service.player.onSourceChosen((_parentId, value) => value === "online");
        expect(await service.player.chooseSource("post-1", "downloaded")).toBe(false);
        expect(service.player.sourceOverride("post-1")).toBe("online");
    });

    it("takes the session out of what plays once the player follows an Online pick, before its release", async () => {
        const { service } = await setup(4);
        const playback = await service.player.open(content, { preferOnline: false });
        service.player.onSourceChosen(async () => false);
        await service.player.chooseSource("post-1", "online");
        expect(service.player.playing.value?.playbackId).toBe(playback?.playbackId);

        const { service: followed } = await setup(4);
        await followed.player.open(content, { preferOnline: false });
        followed.player.onSourceChosen(() => true);
        expect(await followed.player.chooseSource("post-1", "online")).toBe(true);
        expect(followed.player.playing.value).toMatchObject({
            parentId: "post-1",
            downloadId: "d1",
        });
        expect(followed.player.playing.value?.playbackId).toBeUndefined();
    });

    it("shows a notice on the player's screen when a listener takes it, else as a notification", async () => {
        const { service, deps } = await setup(4);
        const shown = vi.fn(() => true);
        const stop = service.player.onNotice(shown);
        service.player.notice("hello");
        expect(shown).toHaveBeenCalledWith("hello");
        expect(deps.notify).not.toHaveBeenCalled();
        stop();
        service.player.onNotice(() => false);
        service.player.notice("again");
        expect(deps.notify).toHaveBeenCalledWith("again", "info");
    });
});

describe("player.onMoreReady", () => {
    it("folds everything that becomes playable within 2 s into one report", async () => {
        vi.useFakeTimers();
        const { service, fake } = await setup(2);
        const more = vi.fn();
        service.player.onMoreReady(more);
        expect(await service.player.open(content, { preferOnline: false })).not.toBeNull();

        fake.tick();
        await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS / 2);
        fake.tick();
        expect(more).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS / 2 + 1);
        expect(more).toHaveBeenCalledTimes(1);
        expect(more).toHaveBeenCalledWith("post-1");

        await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS * 2);
        expect(more).toHaveBeenCalledTimes(1);
    });

    it("reports for an item streamed while it downloads, and not for another item", async () => {
        vi.useFakeTimers();
        const { service, fake } = await setup(1);
        const more = vi.fn();
        service.player.onMoreReady(more);
        expect(await service.player.open(content, { preferOnline: false })).toBeNull();
        fake.tick();
        await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
        expect(more).toHaveBeenCalledTimes(1);

        await service.player.open(makeContent({ parentId: "post-9" }), { preferOnline: false });
        fake.tick();
        await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
        expect(more).toHaveBeenCalledTimes(1);
    });

    /**
     * Holds the next `openPlayback` until released. `readFirst`: the engine reads the download before the hold, so a
     * chapter that finishes during it is not in the session.
     */
    function holdOpen(fake: ReturnType<typeof createFakeEngine>, readFirst = false) {
        const openPlayback = fake.openPlayback.bind(fake);
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => (release = resolve));
        vi.spyOn(fake, "openPlayback").mockImplementationOnce(async (downloadId) => {
            const read = readFirst ? openPlayback(downloadId) : undefined;
            await gate;
            return read ?? openPlayback(downloadId);
        });
        return () => release();
    }

    it("reports again once an open settles whose session lacks a chapter that finished as it opened", async () => {
        vi.useFakeTimers();
        const { service, fake } = await setup(2);
        const more = vi.fn();
        service.player.onMoreReady(more);
        expect(await service.player.open(content, { preferOnline: false })).not.toBeNull();
        const release = holdOpen(fake, true);

        const opening = service.player.open(content, { preferOnline: false });
        await vi.advanceTimersByTimeAsync(0);
        fake.tick();
        await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
        expect(more).toHaveBeenCalledTimes(1);
        release();
        const opened = await opening;
        expect(opened?.timeline.chapter(fake.entry("d1")!.chapters[1]).available).toBe(false);

        await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
        expect(more).toHaveBeenCalledTimes(2);
    });

    it("reports nothing for a chapter the session of an open that settled meanwhile holds", async () => {
        vi.useFakeTimers();
        const { service, fake } = await setup(2);
        const more = vi.fn();
        service.player.onMoreReady(more);
        expect(await service.player.open(content, { preferOnline: false })).not.toBeNull();
        const release = holdOpen(fake);

        const opening = service.player.open(content, { preferOnline: false });
        await vi.advanceTimersByTimeAsync(0);
        fake.tick();
        await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS / 2);
        release();
        const opened = await opening;
        expect(opened?.timeline.chapter(fake.entry("d1")!.chapters[1]).available).toBe(true);

        await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS);
        expect(more).not.toHaveBeenCalled();
    });

    it("reports nothing for a chapter complete before the open that the session's timeline reports unavailable", async () => {
        vi.useFakeTimers();
        const { service, fake } = await setup(4);
        const openPlayback = fake.openPlayback.bind(fake);
        const chapter = fake.entry("d1")!.chapters[1];
        // A chapter whose start lies outside every span is unavailable though done, and stays so on every open.
        vi.spyOn(fake, "openPlayback").mockImplementation(async (downloadId) => {
            const session = await openPlayback(downloadId);
            const timeline = session.timeline;
            return {
                ...session,
                timeline: {
                    ...timeline,
                    chapter: (c) =>
                        c.startTime === chapter.startTime
                            ? { startTime: 0, endTime: 0, available: false }
                            : timeline.chapter(c),
                },
            };
        });
        const more = vi.fn();
        service.player.onMoreReady(more);

        for (let i = 0; i < 2; i++) {
            const opened = await service.player.open(content, { preferOnline: false });
            expect(opened?.timeline.chapter(chapter).available).toBe(false);
            await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
        }
        expect(more).not.toHaveBeenCalled();
    });
});

describe("contentFromSnapshot", () => {
    it("builds a stand-in that names no online master and is never eligible", async () => {
        const { service, fake } = await setup(4);
        const standIn = service.contentFromSnapshot(fake.entry("d1")!);
        expect(standIn).toMatchObject({
            _id: "content-1",
            parentId: "post-1",
            title: "Item one",
            language: "lang-eng",
            memberOf: ["group-public"],
        });
        expect(standIn.parentMedia?.hlsUrl).toBeUndefined();
        expect(service.eligibility(() => standIn).value).toBe(false);
        expect(await service.player.open(standIn, { preferOnline: false })).not.toBeNull();
    });

    it("keeps the stored media address in the snapshot as the progress id, never as a source", () => {
        const snapshot = snapshotFor(makeContent(), ["group-public"]);
        expect(snapshot.mediaId).toBe("https://cdn.example.org/post-1/master.m3u8");

        const standIn = contentFromSnapshot(makeEntry({ content: snapshot }));
        expect(standIn.parentMedia).toEqual({});
        expect(hasDownloadableMedia(standIn)).toBe(false);
        expect(snapshotFor(makeContent({ parentMedia: undefined }), []).mediaId).toBeUndefined();
    });
});
