import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    DownloadOptions,
    DownloadSheetModel,
    DownloadsEngine,
} from "@/build-time/contracts/downloads/contract";
import { createFakeEngine, FAKE_OPTIONS, type FakeEngineOptions } from "../fakeEngine";
import { MORE_READY_FOLD_MS } from "../player";
import { createDownloadsService, type DownloadsRuntime } from "../service";
import { preselect } from "../sheet";
import { flush, makeContent, makeDeps, makeParent } from "./helpers";

let services: DownloadsRuntime[] = [];
afterEach(() => {
    services.forEach((s) => s.dispose());
    services = [];
});

async function setup(
    options: { engine?: FakeEngineOptions; wrap?: (e: DownloadsEngine) => DownloadsEngine } = {},
) {
    const fake = createFakeEngine(options.engine);
    const helpers = makeDeps();
    helpers.docs.set("post-1", makeParent());
    helpers.docs.set("content-1", makeContent());
    const engine = options.wrap ? options.wrap(fake) : fake;
    const service = createDownloadsService(engine, helpers.deps);
    services.push(service);
    await service.whenReady;
    return { fake, service, ...helpers };
}

const model = (fake: ReturnType<typeof createFakeEngine>): DownloadSheetModel => {
    if (!fake.sheet.value) throw new Error("no sheet");
    return fake.sheet.value.model;
};

const audio = { kind: "audio" as const, audioLanguage: "en" };

async function startAll(
    fake: ReturnType<typeof createFakeEngine>,
    chapters = [0, 1, 2],
    meteredConsent = false,
) {
    fake.act({ action: "start", selection: audio, chapters, meteredConsent });
    await flush();
    await flush();
}

describe("openSheet", () => {
    it("presents the sheet at once while preparing, then sends the options", async () => {
        let releaseOptions: () => void = () => undefined;
        const { fake, service } = await setup({
            wrap: (engine) => ({
                ...engine,
                options: (source, selection) =>
                    new Promise<DownloadOptions>((resolve) => {
                        releaseOptions = () => resolve(engine.options(source, selection));
                    }),
            }),
        });
        const opening = service.openSheet(makeContent(), { context: "player" });
        await flush();
        expect(model(fake)).toMatchObject({
            phase: "preparing",
            kinds: [],
            chapters: [],
            locked: false,
            title: "Item one",
        });
        expect(fake.sheet.value?.texts?.title).toBe("t:downloads.sheet.title");
        releaseOptions();
        await opening;
        const ready = model(fake);
        expect(ready.phase).toBe("ready");
        expect(ready.kinds).toEqual(FAKE_OPTIONS.kinds);
        expect(ready.chapters.map((c) => c.state)).toEqual(["none", "none", "none"]);
        expect(ready.selection).toEqual({
            kind: "video",
            angleId: "main",
            qualityId: "720",
            audioLanguage: "en",
        });
        expect(ready.freeBytes).toBe(8_000_000_000);
        expect(ready.reserveBytes).toBe(500_000_000);
        expect(ready.reclaimableBytes).toBe(40_000_000);
        expect(ready.source).toEqual({ current: "online", canDownloaded: false, canOnline: true });
        expect(ready.existing).toEqual([]);
        expect(ready.download).toBeUndefined();
    });

    it("leaves the source switch out from My Downloads and preselects a chosen chapter", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent(), { context: "downloads", chapter: 1 });
        expect(model(fake).source).toBeUndefined();
        expect(model(fake).chosen).toEqual([1]);
    });

    it("shows an error when the options cannot be had, and retries", async () => {
        let fail = true;
        const { fake, service } = await setup({
            wrap: (engine) => ({
                ...engine,
                options: (source, selection) =>
                    fail ? Promise.reject(new Error("offline")) : engine.options(source, selection),
            }),
        });
        await service.openSheet(makeContent(), { context: "player" });
        expect(model(fake)).toMatchObject({ phase: "error", message: "t:downloads.sheet.error" });
        fail = false;
        fake.act({ action: "retry" });
        await flush();
        await flush();
        expect(model(fake).phase).toBe("ready");
    });

    it("says the item could not be read when the engine cannot read the source", async () => {
        for (const code of ["invalid-source", "fetch-failed", "key-required", "decrypt-failed"]) {
            const { fake, service } = await setup({
                wrap: (engine) => ({
                    ...engine,
                    options: () => Promise.reject(Object.assign(new Error(code), { code })),
                }),
            });
            await service.openSheet(makeContent(), { context: "player" });
            expect(model(fake)).toMatchObject({
                phase: "error",
                message: "t:downloads.sheet.unreadable",
            });
        }
    });

    it("opens on its first step, reading nothing, once the item was warmed", async () => {
        const { fake, service } = await setup();
        const options = vi.spyOn(fake, "options");
        service.warmSheet!(makeContent());
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(options).toHaveBeenCalledTimes(1);
        const present = vi.spyOn(fake, "presentSheet");
        await service.openSheet(makeContent(), { context: "player" });
        expect(present.mock.calls[0][0]).toMatchObject({ phase: "ready" });
        expect(options).toHaveBeenCalledTimes(1);
    });

    it("preselects what plays where the options offer it, ignoring what they do not", async () => {
        const { fake, service } = await setup();
        const present = vi.spyOn(fake, "presentSheet");
        const hint = { kind: "video" as const, qualityId: "360", audioLanguage: "fr" };
        await service.openSheet(makeContent(), { context: "player", selection: hint });
        expect(present.mock.calls[0][0]).toMatchObject({
            phase: "preparing",
            selection: { kind: "video", qualityId: "360", audioLanguage: "fr" },
        });
        // A new download starts on the app's language, whatever language plays.
        expect(model(fake).selection).toEqual({
            kind: "video",
            angleId: "main",
            qualityId: "360",
            audioLanguage: "en",
        });

        await service.openSheet(makeContent(), {
            context: "player",
            selection: { kind: "video", angleId: "wide", qualityId: "1080", audioLanguage: "de" },
        });
        expect(model(fake).selection).toEqual({
            kind: "video",
            angleId: "main",
            qualityId: "720",
            audioLanguage: "en",
        });
    });

    it("keeps an existing download's selection whatever the hint", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0]);
        await service.openSheet(makeContent(), {
            context: "player",
            selection: { kind: "video", qualityId: "360", audioLanguage: "fr" },
        });
        expect(model(fake).selection).toEqual(audio);
    });

    it("manages an existing download from what it holds when the source cannot be had", async () => {
        const { fake, service, deps } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0]);
        fake.tick();
        fake.tick();
        // Offline: the key and the options cannot be fetched.
        vi.mocked(deps.resolveSource).mockRejectedValue(new Error("offline"));
        await service.openSheet(makeContent(), { context: "player" });
        const offline = model(fake);
        expect(offline.phase).toBe("ready");
        expect(offline.locked).toBe(true);
        expect(offline.chapters.map((c) => c.state)).toEqual(["done", "none", "none"]);
        expect(offline.download?.status).toBeDefined();

        const start = vi.spyOn(fake, "start");
        await startAll(fake, [1]);
        expect(start).not.toHaveBeenCalled();
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.start_failed", "error");
    });

    it("offers only the downloads on the volume the download goes to for Free up space", async () => {
        const { fake, service } = await setup({ engine: { card: true } });
        await service.openSheet(makeContent({ parentId: "post-2", _id: "c2" }), {
            context: "downloads",
        });
        await startAll(fake);
        const internal = service.entries.value[0];
        await service.setPreferredVolume("card-1");
        await service.openSheet(makeContent({ parentId: "post-3", _id: "c3" }), {
            context: "downloads",
        });
        await startAll(fake);
        const card = service.entries.value.find((e) => e.parentId === "post-3")!;
        expect(internal.volumeId).toBe("internal");
        expect(card.volumeId).toBe("card-1");

        await service.openSheet(makeContent(), { context: "downloads" });
        expect(model(fake).existing.map((e) => e.downloadId)).toEqual([card.downloadId]);
    });

    it("offers nothing for Free up space while no volume is known", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent({ parentId: "post-2", _id: "c2" }), {
            context: "downloads",
        });
        await startAll(fake);
        service.internals.state.storage.value = null;
        await service.openSheet(makeContent(), { context: "downloads" });
        expect(model(fake).freeBytes).toBe(0);
        expect(model(fake).existing).toEqual([]);
    });

    it("gives the free space of the preferred card when it is mounted", async () => {
        const { fake, service } = await setup({ engine: { card: true } });
        await service.setPreferredVolume("card-1");
        await service.openSheet(makeContent(), { context: "downloads" });
        expect(model(fake).freeBytes).toBe(20_000_000_000);
        await startAll(fake);
        expect(service.entries.value[0].volumeId).toBe("card-1");
    });
});

describe("start", () => {
    it("starts a new download with a fresh id, the snapshot, the words and the pins", async () => {
        const { fake, service, pins } = await setup();
        const start = vi.spyOn(fake, "start");
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0, 2]);
        // The engine fills the length in from the media.
        expect(start.mock.calls[0][0].content.durationSeconds).toBe(0);
        expect(fake.permissionRequests).toBe(1);
        const [entry] = service.entries.value;
        expect(entry.downloadId).toMatch(/^[0-9a-f]{32}$/);
        expect(entry.selection).toEqual(audio);
        expect(entry.chapters.map((c) => c.unitIds.length > 0)).toEqual([true, false, true]);
        expect(entry.content).toMatchObject({
            title: "Item one",
            contentId: "content-1",
            memberOf: ["group-public"],
        });
        expect(fake.texts.get(entry.downloadId)).toMatchObject({
            title: "Item one",
            progress: "t:downloads.notification.progress",
        });
        expect(pins.has("post-1") && pins.has("content-1")).toBe(true);
        // The platform closes its sheet after Start.
        expect(fake.sheet.value).toBeNull();
    });

    it("asks for the notification permission before a download starts only while none exist", async () => {
        const { fake, service } = await setup();
        const order: string[] = [];
        const ask = fake.requestNotificationPermission.bind(fake);
        const start = fake.start.bind(fake);
        vi.spyOn(fake, "requestNotificationPermission").mockImplementation(
            () => (order.push("ask"), ask()),
        );
        vi.spyOn(fake, "start").mockImplementation((r) => (order.push("start"), start(r)));
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake);
        await service.openSheet(makeContent({ parentId: "post-2", _id: "c2" }), {
            context: "player",
        });
        await startAll(fake);
        expect(order).toEqual(["ask", "start", "start"]);
    });

    it("adds chapters to the existing download after a source check, without asking for permission again", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0]);
        const id = service.entries.value[0].downloadId;
        fake.tick();
        fake.tick();
        const checkSource = vi.spyOn(fake, "checkSource");

        await service.openSheet(makeContent(), { context: "player" });
        const locked = model(fake);
        expect(locked.locked).toBe(true);
        expect(locked.selection).toEqual(audio);
        expect(locked.chapters.map((c) => c.state)).toEqual(["done", "none", "none"]);
        await startAll(fake, [1, 2]);
        expect(checkSource).toHaveBeenCalledWith(id, expect.anything());
        expect(service.entries.value).toHaveLength(1);
        expect(service.entries.value[0].downloadId).toBe(id);
        expect(service.entries.value[0].chapters.every((c) => c.unitIds.length > 0)).toBe(true);
        expect(fake.permissionRequests).toBe(1);
    });

    it("does not add when the source check defers chapters, and tells the viewer why", async () => {
        const { fake, service, deps } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0]);
        fake.tick();
        fake.tick();
        const start = vi.spyOn(fake, "start");
        fake.deferNextCheck();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [1]);
        expect(start).not.toHaveBeenCalled();
        expect(deps.notify).toHaveBeenCalledWith(
            "t:downloads.notice.updated_while_playing",
            "info",
        );
    });

    it("shows a now-playing notice instead of an app notification when the player takes it", async () => {
        const { fake, service, deps } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0]);
        fake.tick();
        fake.tick();
        const shown: string[] = [];
        service.player.onNotice((text) => (shown.push(text), true));
        fake.deferNextCheck();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [1]);
        expect(shown).toEqual(["t:downloads.notice.updated_while_playing"]);
        expect(deps.notify).not.toHaveBeenCalled();
    });

    it("does not add when the source check cannot run, and says so", async () => {
        const { fake, service, deps } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0]);
        await service.openSheet(makeContent(), { context: "player" });
        const start = vi.spyOn(fake, "start");
        const resolveSource = vi.mocked(deps.resolveSource);
        resolveSource.mockClear();
        vi.spyOn(fake, "checkSource").mockRejectedValueOnce(new Error("offline"));
        await startAll(fake, [1]);
        expect(start).not.toHaveBeenCalled();
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.start_failed", "error");
        // The check uses the source the sheet already resolved, with no second key fetch.
        expect(resolveSource).not.toHaveBeenCalled();
    });

    it("says the item could not be read when the check fails on reading the source", async () => {
        const { fake, service, deps } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0]);
        await service.openSheet(makeContent(), { context: "player" });
        const start = vi.spyOn(fake, "start");
        vi.spyOn(fake, "checkSource").mockRejectedValueOnce(
            Object.assign(new Error("fetch"), { code: "fetch-failed" }),
        );
        await startAll(fake, [1]);
        expect(start).not.toHaveBeenCalled();
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.unreadable", "error");
    });

    it("says the item could not be read when the start fails on reading the source", async () => {
        const { fake, service, deps } = await setup({
            wrap: (engine) => ({
                ...engine,
                start: () =>
                    Promise.reject(Object.assign(new Error("key"), { code: "decrypt-failed" })),
            }),
        });
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake);
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.unreadable", "error");
    });

    it("does not add to a download whose source is gone, and says so", async () => {
        const { fake, service, deps } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0]);
        await service.openSheet(makeContent(), { context: "player" });
        const start = vi.spyOn(fake, "start");
        vi.spyOn(fake, "checkSource").mockResolvedValueOnce({
            replacedChapters: [],
            deferredChapters: [],
            sideFilesRefreshed: false,
            gone: true,
        });
        await startAll(fake, [1]);
        expect(start).not.toHaveBeenCalled();
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.start_failed", "error");
    });

    it("does not start a download whose groups are not known", async () => {
        const { fake, service, docs, deps } = await setup();
        docs.clear();
        await service.openSheet(makeContent({ memberOf: undefined }), { context: "player" });
        await startAll(fake);
        expect(service.entries.value).toEqual([]);
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.start_failed", "error");
    });

    it("keeps no expiry on an add when the download has none", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0]);
        const start = vi.spyOn(fake, "start");
        const soon = Date.now() + 86_400_000;
        await service.openSheet(makeContent({ expiryDate: soon }), { context: "player" });
        await startAll(fake, [1]);
        expect(start.mock.calls[0][0].expiresAt).toBeNull();
    });

    it("tells the viewer when the download does not fit", async () => {
        const { fake, service, deps } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        fake.setFreeBytes(1);
        await startAll(fake);
        expect(service.entries.value).toEqual([]);
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.no_space", "error");
    });

    it("tells it on the now-playing screen when the player shows notices there", async () => {
        const { fake, service, deps } = await setup();
        const shown: string[] = [];
        service.player.onNotice((text) => (shown.push(text), true));
        await service.openSheet(makeContent(), { context: "player" });
        fake.setFreeBytes(1);
        await startAll(fake);
        expect(shown).toEqual(["t:downloads.notice.no_space"]);
        expect(deps.notify).not.toHaveBeenCalled();
    });
});

describe("the manage row and space", () => {
    it("deletes other downloads from Free up space and sends the model again", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent({ parentId: "post-2", _id: "c2" }), {
            context: "player",
        });
        await startAll(fake);
        const other = service.entries.value[0].downloadId;
        await service.openSheet(makeContent(), { context: "player" });
        expect(model(fake).existing.map((e) => e.downloadId)).toEqual([other]);
        fake.act({ action: "delete", downloadIds: [other] });
        await flush();
        await flush();
        expect(service.entries.value).toEqual([]);
        expect(model(fake).existing).toEqual([]);
    });

    it("cleans up and sends the reclaimable space again", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        expect(model(fake).reclaimableBytes).toBe(40_000_000);
        fake.act({ action: "cleanUp" });
        await flush();
        await flush();
        expect(model(fake).reclaimableBytes).toBe(0);
        expect(model(fake).freeBytes).toBe(8_040_000_000);
    });

    it("pauses, and resumes with or without mobile-data consent", async () => {
        const { fake, service } = await setup({ engine: { network: { metered: true } } });
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0, 1, 2], true);
        const id = service.entries.value[0].downloadId;
        await service.openSheet(makeContent(), { context: "player" });
        fake.act({ action: "pause" });
        await flush();
        await flush();
        expect(model(fake).download).toMatchObject({ status: "paused", reason: "user" });

        fake.act({ action: "resume", meteredConsent: false });
        await flush();
        await flush();
        expect(fake.entry(id)).toMatchObject({ status: "waiting", reason: "metered" });
        expect(model(fake).download).toMatchObject({ status: "waiting", reason: "metered" });

        fake.act({ action: "resume", meteredConsent: true });
        await flush();
        await flush();
        expect(fake.entry(id)).toMatchObject({ status: "downloading", meteredConsent: true });
    });

    it("removes the download from the manage row", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake);
        await service.openSheet(makeContent(), { context: "player" });
        fake.act({ action: "remove" });
        await flush();
        await flush();
        expect(service.entries.value).toEqual([]);
        expect(model(fake).locked).toBe(false);
        expect(model(fake).download).toBeUndefined();
    });

    it("sends a refreshing download as complete", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake);
        for (let i = 0; i < 4; i++) fake.tick();
        const id = service.entries.value[0].downloadId;
        // Only an item refresh left, waiting for Wi-Fi: the refresh shows as nothing at all.
        const entry = {
            ...fake.entry(id)!,
            status: "waiting" as const,
            reason: "metered" as const,
        };
        service.internals.state.applyEntry(entry);
        await service.openSheet(makeContent(), { context: "player" });
        expect(model(fake).download).toEqual({ status: "complete", reason: null, progress: 1 });
    });

    it("records the viewer's source choice and reports it to the player", async () => {
        const { fake, service } = await setup();
        const chosen = vi.fn();
        service.player.onSourceChosen(chosen);
        await service.openSheet(makeContent(), { context: "player" });
        fake.act({ action: "source", value: "downloaded" });
        await flush();
        expect(chosen).toHaveBeenCalledWith("post-1", "downloaded");
        expect(service.player.sourceOverride("post-1")).toBe("downloaded");
        // Nothing downloaded plays yet, so the next open streams.
        expect(model(fake).source?.current).toBe("online");
    });

    describe("the switch while the item is in the player", () => {
        /** A playable download of the item, with the player following each pick as the page does. */
        async function playing() {
            const ctx = await setup();
            await ctx.service.openSheet(makeContent(), { context: "player" });
            await startAll(ctx.fake);
            for (let i = 0; i < 4; i++) ctx.fake.tick();
            await flush();
            ctx.service.player.onSourceChosen(async (_parentId, value) => {
                if (value === "downloaded")
                    return !!(await ctx.service.player.open(makeContent(), {
                        preferOnline: false,
                    }));
                return true;
            });
            return ctx;
        }
        const playbackId = (service: DownloadsRuntime) => service.player.playing.value!.playbackId!;

        it("names the download while a session of it plays, though Online was the last pick", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            fake.act({ action: "source", value: "online" });
            await flush();
            expect(model(fake).source?.current).toBe("online");

            // The player moves onto the download by itself when more of it is ready.
            await service.player.open(makeContent(), { preferOnline: false });
            await service.openSheet(makeContent(), { context: "player" });

            expect(service.player.sourceOverride("post-1")).toBe("online");
            expect(model(fake).source?.current).toBe("downloaded");
        });

        it("names the download in the sheet left open once the player moves onto it by itself", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            await service.player.open(makeContent(), { preferOnline: true });
            await flush();
            expect(model(fake).source?.current).toBe("online");
            const sent = vi.spyOn(fake, "updateSheet");

            // The mid-play switch when more of the download is ready, with no sheet action behind it.
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();

            expect(sent).toHaveBeenCalledTimes(1);
            expect(model(fake).source?.current).toBe("downloaded");
        });

        it("names the stream at once after a followed Online pick, before the session is released", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            fake.act({ action: "source", value: "downloaded" });
            await flush();
            expect(model(fake).source?.current).toBe("downloaded");
            expect(fake.sessions.size).toBe(1);

            fake.act({ action: "source", value: "online" });
            await flush();

            expect(fake.sessions.size).toBe(1);
            expect(model(fake).source?.current).toBe("online");
        });

        it("names the stream once the player released the download picked, also in the sheet left open", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            fake.act({ action: "source", value: "downloaded" });
            await flush();
            const sent = vi.spyOn(fake, "updateSheet");

            // The player streams on its own (a failed load, a chapter played online, a cast) and lets the session go.
            fake.closeSession(playbackId(service));
            await flush();

            expect(sent).toHaveBeenCalledTimes(1);
            expect(model(fake).source?.current).toBe("online");
            await service.openSheet(makeContent(), { context: "player" });
            expect(service.player.sourceOverride("post-1")).toBe("downloaded");
            expect(model(fake).source?.current).toBe("online");
        });

        it("names the stream once the engine closed the session that played", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            fake.act({ action: "source", value: "downloaded" });
            await flush();

            fake.closeSession(playbackId(service), "volume-unavailable");
            await flush();

            expect(model(fake).source?.current).toBe("online");
        });

        it("keeps naming the download in the sheet left open while the player opens a new session of it", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();
            expect(model(fake).source?.current).toBe("downloaded");
            const sent = vi.spyOn(fake, "updateSheet");

            // The mid-play switch onto the download when more of it is ready.
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();

            // Sent once, when the new session took over: the open in between changed nothing the viewer hears.
            expect(sent.mock.calls.map(([m]) => m.source?.current)).toEqual(["downloaded"]);
        });

        it("names the stream once the engine closed the session that replaced another", async () => {
            const { fake, service } = await playing();
            await service.player.open(makeContent(), { preferOnline: false });
            await service.player.open(makeContent(), { preferOnline: false });
            await service.openSheet(makeContent(), { context: "player" });

            fake.closeSession(playbackId(service), "volume-unavailable");
            await flush();

            expect(model(fake).source?.current).toBe("online");
        });

        it("names the download in a sheet opened while a new session of it is opening", async () => {
            const { fake, service } = await playing();
            await service.player.open(makeContent(), { preferOnline: false });
            const openPlayback = fake.openPlayback.bind(fake);
            let release: () => void = () => undefined;
            const gate = new Promise<void>((resolve) => (release = resolve));
            vi.spyOn(fake, "openPlayback").mockImplementationOnce(async (downloadId) => {
                await gate;
                return openPlayback(downloadId);
            });

            const opening = service.player.open(makeContent(), { preferOnline: false });
            await service.openSheet(makeContent(), { context: "player" });
            expect(model(fake).source?.current).toBe("downloaded");

            release();
            await opening;
            await flush();
            expect(model(fake).source?.current).toBe("downloaded");
        });

        it("keeps naming the download while a new session of it fails to open and the old one plays on", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();
            const kept = playbackId(service);
            const sent = vi.spyOn(fake, "updateSheet");
            vi.spyOn(fake, "openPlayback").mockRejectedValueOnce(new Error("io"));

            await service.player.open(makeContent(), { preferOnline: false });
            await flush();

            expect(playbackId(service)).toBe(kept);
            // Nothing the viewer hears changed, so nothing is sent.
            expect(sent).not.toHaveBeenCalled();
            expect(model(fake).source?.current).toBe("downloaded");
        });

        /** Holds the next `openPlayback` until the returned function is called; it then rejects with `failure`, if given. */
        function holdNextOpen(fake: ReturnType<typeof createFakeEngine>, failure?: Error) {
            const openPlayback = fake.openPlayback.bind(fake);
            let release: () => void = () => undefined;
            const gate = new Promise<void>((resolve) => (release = resolve));
            const spy = vi.spyOn(fake, "openPlayback");
            spy.mockImplementationOnce(async (downloadId) => {
                await gate;
                if (failure) throw failure;
                return openPlayback(downloadId);
            });
            return { spy, release: () => release() };
        }

        it("keeps naming the download while a second open of it overlaps the first and fails", async () => {
            const { fake, service, deps } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();
            const kept = playbackId(service);
            const { spy, release } = holdNextOpen(fake);
            spy.mockRejectedValueOnce(new Error("io"));
            const sent = vi.spyOn(fake, "updateSheet");
            vi.mocked(deps.notify).mockClear();

            const first = service.player.open(makeContent(), { preferOnline: false });
            await flush();
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();
            release();

            // The second open took the player, so the first one's session is let go.
            expect(await first).toBeNull();
            await flush();
            expect(playbackId(service)).toBe(kept);
            expect(new Set(sent.mock.calls.map(([m]) => m.source?.current))).not.toContain(
                "online",
            );
            expect(model(fake).source?.current).toBe("downloaded");
            // The session that played plays on, so nothing streams and no notice says it does.
            expect(deps.notify).not.toHaveBeenCalled();
        });

        it("keeps naming the download while the first of two overlapping opens settles before the second", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();
            const firstHeld = holdNextOpen(fake);
            const first = service.player.open(makeContent(), { preferOnline: false });
            await flush();
            const secondHeld = holdNextOpen(fake);
            const second = service.player.open(makeContent(), { preferOnline: false });
            await flush();
            const sent = vi.spyOn(fake, "updateSheet");

            firstHeld.release();
            expect(await first).toBeNull();
            await flush();
            expect(model(fake).source?.current).toBe("downloaded");

            secondHeld.release();
            expect(await second).not.toBeNull();
            await flush();
            expect(new Set(sent.mock.calls.map(([m]) => m.source?.current))).not.toContain(
                "online",
            );
            expect(model(fake).source?.current).toBe("downloaded");
        });

        it("puts back the session that played when the player lets go of an overlapping open's session", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();
            const kept = playbackId(service);
            const { release } = holdNextOpen(fake);
            const first = service.player.open(makeContent(), { preferOnline: false });
            await flush();

            // The player could not load the second session where the viewer is, so the one that played plays on.
            const second = await service.player.open(makeContent(), { preferOnline: false });
            await second!.close();
            await flush();

            expect(playbackId(service)).toBe(kept);
            expect(model(fake).source?.current).toBe("downloaded");
            release();
            expect(await first).toBeNull();
        });

        it("plays the new session though more of the download became ready while it was opening", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();
            const { release } = holdNextOpen(fake);
            const sent = vi.spyOn(fake, "updateSheet");
            const entry = service.entries.value[0];
            vi.useFakeTimers();
            try {
                const opening = service.player.open(makeContent(), { preferOnline: false });
                await vi.advanceTimersByTimeAsync(0);
                service.player.entryChanged({
                    ...entry,
                    units: [
                        ...entry.units,
                        { ...entry.units[0], unitId: "unit-more", state: "done" },
                    ],
                });
                await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
                release();
                const opened = await opening;
                await vi.advanceTimersByTimeAsync(0);

                expect(opened).not.toBeNull();
                expect(playbackId(service)).toBe(opened!.playbackId);
                expect(new Set(sent.mock.calls.map(([m]) => m.source?.current))).toEqual(
                    new Set(["downloaded"]),
                );
            } finally {
                vi.useRealTimers();
            }
        });

        /** Reports one more unit of the item's download done, as the engine does when a unit finishes. */
        function unitFinished(service: DownloadsRuntime) {
            const entry = service.entries.value[0];
            service.player.entryChanged({
                ...entry,
                units: [...entry.units, { ...entry.units[0], unitId: "unit-more", state: "done" }],
            });
        }

        it("keeps the session that plays when its replacement fails after more of the download became ready", async () => {
            const { fake, service, deps } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();
            const kept = playbackId(service);
            const { release } = holdNextOpen(fake, new Error("io"));
            const sent = vi.spyOn(fake, "updateSheet");
            vi.mocked(deps.notify).mockClear();
            vi.useFakeTimers();
            try {
                const opening = service.player.open(makeContent(), { preferOnline: false });
                await vi.advanceTimersByTimeAsync(0);
                unitFinished(service);
                await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
                release();
                expect(await opening).toBeNull();
                await vi.advanceTimersByTimeAsync(0);

                expect(playbackId(service)).toBe(kept);
                expect(new Set(sent.mock.calls.map(([m]) => m.source?.current))).not.toContain(
                    "online",
                );
                expect(model(fake).source?.current).toBe("downloaded");
                expect(deps.notify).not.toHaveBeenCalled();
            } finally {
                vi.useRealTimers();
            }
        });

        it("says the item streams when a first open fails online after more of the download became ready", async () => {
            const { fake, service, deps } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            expect(service.player.playing.value).toBeNull();
            const { release } = holdNextOpen(fake, new Error("io"));
            vi.mocked(deps.notify).mockClear();
            vi.useFakeTimers();
            try {
                const opening = service.player.open(makeContent(), { preferOnline: false });
                await vi.advanceTimersByTimeAsync(0);
                unitFinished(service);
                await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
                release();
                expect(await opening).toBeNull();
                await vi.advanceTimersByTimeAsync(0);

                expect(deps.notify).toHaveBeenCalledWith(
                    "t:downloads.notice.streaming_fallback",
                    "info",
                );
            } finally {
                vi.useRealTimers();
            }
        });

        it("names the stream once the engine closed the session being replaced, before the open settles", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();
            const kept = playbackId(service);
            const { release } = holdNextOpen(fake);

            const opening = service.player.open(makeContent(), { preferOnline: false });
            await flush();
            fake.closeSession(kept, "volume-unavailable");
            await flush();

            expect(model(fake).source?.current).toBe("online");
            release();
            await opening;
        });

        it("names the stream after a failed new session once an Online pick is followed", async () => {
            const { fake, service } = await playing();
            await service.openSheet(makeContent(), { context: "player" });
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();
            vi.spyOn(fake, "openPlayback").mockRejectedValueOnce(new Error("io"));
            await service.player.open(makeContent(), { preferOnline: false });
            await flush();
            expect(model(fake).source?.current).toBe("downloaded");

            fake.act({ action: "source", value: "online" });
            await flush();

            expect(model(fake).source?.current).toBe("online");
        });

        it("keeps another item's sheet marking the download as playing while a new session of it opens", async () => {
            const { fake, service } = await playing();
            await service.player.open(makeContent(), { preferOnline: false });
            const downloadId = service.entries.value[0].downloadId;
            await service.openSheet(makeContent({ parentId: "post-2", _id: "c2" }), {
                context: "player",
            });
            const marked = () =>
                model(fake).existing.find((e) => e.downloadId === downloadId)?.playing;
            expect(marked()).toBe(true);
            const sent = vi.spyOn(fake, "updateSheet");

            await service.player.open(makeContent(), { preferOnline: false });
            await flush();

            const marks = sent.mock.calls.map(
                ([m]) => m.existing.find((e) => e.downloadId === downloadId)?.playing,
            );
            expect(marks.length).toBeGreaterThan(0);
            expect(new Set(marks)).toEqual(new Set([true]));
        });
    });

    describe("the switch while the item is not in the player", () => {
        /** A playable download of the item, which the player does not hold. */
        async function downloaded() {
            const ctx = await setup();
            await ctx.service.openSheet(makeContent(), { context: "player" });
            await startAll(ctx.fake);
            for (let i = 0; i < 4; i++) ctx.fake.tick();
            await flush();
            expect(ctx.service.player.playing.value).toBeNull();
            return ctx;
        }

        it("names the download the next open plays when no copy was picked", async () => {
            const { fake, service } = await downloaded();

            await service.openSheet(makeContent(), { context: "player" });

            expect(service.player.sourceOverride("post-1")).toBeUndefined();
            expect(model(fake).source?.current).toBe("downloaded");
        });

        it("names Online once picked while there is a network, and the download offline", async () => {
            const { fake, service } = await downloaded();
            await service.openSheet(makeContent(), { context: "player" });
            fake.act({ action: "source", value: "online" });
            await flush();
            expect(model(fake).source?.current).toBe("online");

            fake.setNetwork({ online: false });
            await flush();
            await service.openSheet(makeContent(), { context: "player" });

            expect(model(fake).source?.current).toBe("downloaded");
        });

        it("names the stream for a download whose key is missing, without fetching the key", async () => {
            const { fake, service } = await downloaded();
            const id = service.entries.value[0].downloadId;
            service.internals.state.applyEntry({ ...fake.entry(id)!, key: "missing" });
            const queued = vi.spyOn(service.internals.lifecycle, "queueKeyFetch");

            await service.openSheet(makeContent(), { context: "player" });

            expect(model(fake).source?.current).toBe("online");
            expect(queued).not.toHaveBeenCalled();
        });
    });

    it("sends the model again after every action that leaves the sheet up, and not after start or dismissed", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent({ parentId: "post-2", _id: "c2" }), {
            context: "player",
        });
        await startAll(fake);
        const other = service.entries.value[0].downloadId;
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake, [0]);
        const update = vi.spyOn(fake, "updateSheet");
        const sent = async (action: Parameters<typeof fake.act>[0]) => {
            await service.openSheet(makeContent(), { context: "player" });
            update.mockClear();
            fake.act(action);
            await flush();
            await flush();
            return update.mock.calls.map(([m]) => m.phase);
        };

        // An entry the action changes may send it once more on its own; at least the one after the action goes.
        for (const action of [
            { action: "source" as const, value: "online" as const },
            { action: "pause" as const },
            { action: "resume" as const, meteredConsent: false },
            { action: "cleanUp" as const },
            { action: "delete" as const, downloadIds: [other] },
            { action: "remove" as const },
        ]) {
            const phases = await sent(action);
            expect(phases.length, action.action).toBeGreaterThan(0);
            expect(new Set(phases), action.action).toEqual(new Set(["ready"]));
        }
        expect(await sent({ action: "dismissed" })).toEqual([]);
        expect(
            await sent({ action: "start", selection: audio, chapters: [0], meteredConsent: false }),
        ).toEqual([]);
        expect(fake.sheet.value).toBeNull();
    });

    it("shows a failed delete, removal or clean-up in the sheet, and rebuilds the model on retry", async () => {
        const { fake, service, deps } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake);
        await service.openSheet(makeContent(), { context: "player" });
        const remove = vi
            .spyOn(fake, "remove")
            .mockRejectedValue(Object.assign(new Error("io"), { code: "io" }));
        const cleanUp = vi
            .spyOn(fake, "cleanUp")
            .mockRejectedValue(Object.assign(new Error("io"), { code: "io" }));
        const update = vi.spyOn(fake, "updateSheet");

        for (const action of [
            { action: "remove" as const },
            { action: "delete" as const, downloadIds: ["d-x"] },
            { action: "cleanUp" as const },
        ]) {
            update.mockClear();
            fake.act(action);
            await flush();
            await flush();
            expect(update, action.action).toHaveBeenCalledTimes(1);
            expect(model(fake), action.action).toMatchObject({
                phase: "error",
                message: "t:downloads.sheet.action_failed",
            });
        }
        expect(model(fake).locked).toBe(true);
        expect(deps.reportError).toHaveBeenCalledWith(expect.any(Error), "sheet-remove");
        expect(deps.reportError).toHaveBeenCalledWith(expect.any(Error), "sheet-delete");
        expect(deps.reportError).toHaveBeenCalledWith(expect.any(Error), "clean-up");
        // No app notification: the sheet covers the page and says it itself.
        expect(deps.notify).not.toHaveBeenCalled();

        remove.mockRestore();
        cleanUp.mockRestore();
        fake.act({ action: "retry" });
        await flush();
        await flush();
        expect(model(fake).phase).toBe("ready");
        expect(model(fake).message).toBeUndefined();
        expect(model(fake).kinds).toEqual(FAKE_OPTIONS.kinds);
    });

    it("shows a removal the engine refused in the sheet, but not one of a download it no longer holds", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake);
        await service.openSheet(makeContent(), { context: "player" });
        const remove = vi.spyOn(fake, "remove");
        remove.mockResolvedValueOnce([
            { downloadId: "d-x", removed: false, code: "unknown-download", freedBytes: 0 },
        ]);
        fake.act({ action: "delete", downloadIds: ["d-x"] });
        await flush();
        await flush();
        expect(model(fake).phase).toBe("ready");

        const id = service.entries.value[0].downloadId;
        remove.mockResolvedValueOnce([
            { downloadId: id, removed: false, code: "io", freedBytes: 0 },
        ]);
        fake.act({ action: "remove" });
        await flush();
        await flush();
        expect(model(fake)).toMatchObject({
            phase: "error",
            message: "t:downloads.sheet.action_failed",
        });
    });

    it("shows a failed pause, resume or source choice in the sheet, without an app notification", async () => {
        const { fake, service, deps } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake);
        const engineError = Object.assign(new Error("io"), { code: "io" });
        const cases: [Parameters<typeof fake.act>[0], () => void][] = [
            [{ action: "pause" }, () => vi.spyOn(fake, "pause").mockRejectedValueOnce(engineError)],
            [
                { action: "resume", meteredConsent: false },
                () => vi.spyOn(fake, "resume").mockRejectedValueOnce(engineError),
            ],
            [
                { action: "source", value: "online" },
                () => vi.spyOn(service.player, "chooseSource").mockRejectedValueOnce(engineError),
            ],
        ];
        for (const [action, fail] of cases) {
            await service.openSheet(makeContent(), { context: "player" });
            expect(model(fake).phase).toBe("ready");
            fail();
            fake.act(action);
            await flush();
            await flush();
            expect(model(fake), action.action).toMatchObject({
                phase: "error",
                message: "t:downloads.sheet.action_failed",
            });
        }
        expect(deps.notify).not.toHaveBeenCalled();
    });

    it("shows a pick the player could not follow in the sheet, whose switch still names what plays", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake);
        await service.openSheet(makeContent(), { context: "player" });
        // The player answers as it does when the download picked does not load.
        service.player.onSourceChosen(async () => false);

        fake.act({ action: "source", value: "downloaded" });
        await flush();
        await flush();

        expect(model(fake)).toMatchObject({
            phase: "error",
            message: "t:downloads.sheet.action_failed",
            source: { current: "online" },
        });
        expect(service.player.sourceOverride("post-1")).toBeUndefined();
    });

    it("keeps a download being played on removal from the sheet, and says so rather than failing", async () => {
        const { fake, service, deps } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        await startAll(fake);
        await service.openSheet(makeContent(), { context: "player" });
        const id = service.entries.value[0].downloadId;
        vi.spyOn(fake, "remove").mockResolvedValueOnce([
            { downloadId: id, removed: false, code: "locked", freedBytes: 0 },
        ]);

        fake.act({ action: "remove" });
        await flush();
        await flush();

        expect(model(fake).phase).toBe("ready");
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.kept_playing", "info");
        expect(service.entries.value.map((e) => e.downloadId)).toEqual([id]);
    });

    it("shows the spinner again at once on retry, before the options arrive", async () => {
        let fail = true;
        let releaseOptions: () => void = () => undefined;
        const { fake, service } = await setup({
            wrap: (engine) => ({
                ...engine,
                options: (source, selection) =>
                    fail
                        ? Promise.reject(new Error("offline"))
                        : new Promise<DownloadOptions>((resolve) => {
                              releaseOptions = () => resolve(engine.options(source, selection));
                          }),
            }),
        });
        await service.openSheet(makeContent(), { context: "player" });
        expect(model(fake).phase).toBe("error");
        fail = false;

        fake.act({ action: "retry" });
        await flush();
        expect(model(fake).phase).toBe("preparing");
        expect(model(fake).message).toBeUndefined();

        releaseOptions();
        await flush();
        await flush();
        expect(model(fake).phase).toBe("ready");
    });

    it("ignores an action from a sheet no longer shown", async () => {
        const { fake, service } = await setup();
        await service.openSheet(makeContent(), { context: "player" });
        const stale = model(fake).sheetId;
        await service.openSheet(makeContent(), { context: "player" });
        const update = vi.spyOn(fake, "updateSheet");
        const cleanUp = vi.spyOn(fake, "cleanUp");
        // The platform reports an action of the sheet it showed before.
        fake.sheet.value = { model: { ...model(fake), sheetId: stale } };
        fake.act({ action: "cleanUp" });
        await flush();
        expect(cleanUp).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });
});

describe("preselect", () => {
    it("keeps what the hint names where it is offered", () => {
        expect(
            preselect(FAKE_OPTIONS, { kind: "video", qualityId: "360", audioLanguage: "fr" }),
        ).toEqual({ kind: "video", angleId: "main", qualityId: "360", audioLanguage: "fr" });
        expect(preselect(FAKE_OPTIONS, { kind: "audio", audioLanguage: "de" })).toEqual({
            kind: "audio",
            audioQualityId: "a192",
            audioLanguage: "en",
        });
        expect(
            preselect(FAKE_OPTIONS, { kind: "audio", audioQualityId: "a64", audioLanguage: "fr" }),
        ).toEqual({ kind: "audio", audioQualityId: "a64", audioLanguage: "fr" });
    });
});

describe("wizard answers", () => {
    async function reopen(service: DownloadsRuntime) {
        await service.openSheet(makeContent(), { context: "downloads" });
        await flush();
    }

    it("sends the app's language and the mounted volumes a new download can go to", async () => {
        const { fake, service } = await setup({ engine: { card: true } });
        await reopen(service);
        expect(model(fake).appLanguage).toBe("en");
        expect(model(fake).audioQualities.map((q) => q.id)).toEqual(["a192", "a128", "a64"]);
        expect(model(fake).volumes.map((v) => v.id)).toEqual(["internal", "card-1"]);
    });

    it("starts on the volume the viewer saved to, and keeps it as where new downloads go", async () => {
        const { fake, service } = await setup({ engine: { card: true } });
        await reopen(service);
        fake.act({
            action: "start",
            selection: audio,
            chapters: [0],
            meteredConsent: false,
            volumeId: "card-1",
        });
        await flush();
        await flush();
        expect(service.entryFor("post-1")?.volumeId).toBe("card-1");
        expect(service.storage.value?.preferredVolumeId).toBe("card-1");
    });

    it("removes unticked chapters and adds ticked ones on Update", async () => {
        const { fake, service } = await setup();
        await reopen(service);
        await startAll(fake, [0, 1]);
        fake.tick();
        fake.tick();
        fake.tick();
        await flush();
        await reopen(service);
        fake.act({ action: "update", add: [2], remove: [0], meteredConsent: false });
        await flush();
        await flush();
        const entry = service.entryFor("post-1");
        expect(entry?.chapters.map((c) => c.unitIds.length > 0)).toEqual([false, true, true]);
    });

    it("removes the download when Update unticks every chapter", async () => {
        const { fake, service } = await setup();
        await reopen(service);
        await startAll(fake, [0, 1]);
        await reopen(service);
        fake.act({ action: "update", add: [], remove: [0, 1], meteredConsent: false });
        await flush();
        await flush();
        expect(service.entryFor("post-1")).toBeUndefined();
    });

    it("downloads again when the kind or quality of a download changes", async () => {
        const { fake, service } = await setup();
        await reopen(service);
        await startAll(fake, [0]);
        const before = service.entryFor("post-1")?.downloadId;
        await reopen(service);
        fake.act({
            action: "start",
            selection: { kind: "video", angleId: "main", qualityId: "360", audioLanguage: "en" },
            chapters: [0],
            meteredConsent: false,
        });
        await flush();
        await flush();
        const after = service.entryFor("post-1");
        expect(after?.downloadId).not.toBe(before);
        expect(after?.selection.kind).toBe("video");
    });
});
