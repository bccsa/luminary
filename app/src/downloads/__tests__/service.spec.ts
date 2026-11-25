import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    DownloadStartRequest,
    DownloadsEngine,
} from "@/build-time/contracts/downloads/contract";
import { createFakeEngine, type FakeEngineOptions } from "../fakeEngine";
import { createDownloadsService, LIST_RETRY_MS, type DownloadsRuntime } from "../service";
import { flush, makeContent, makeDeps, makeParent } from "./helpers";

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
    options: { engine?: FakeEngineOptions; wrap?: (e: DownloadsEngine) => DownloadsEngine } = {},
) {
    const fake = createFakeEngine(options.engine);
    const helpers = makeDeps();
    helpers.docs.set("post-1", makeParent());
    const engine = options.wrap ? options.wrap(fake) : fake;
    const service = createDownloadsService(engine, helpers.deps);
    services.push(service);
    return { fake, service, ...helpers };
}

describe("state from the engine", () => {
    it("fills entries, progress and storage from the list, then turns ready", async () => {
        const fake = createFakeEngine();
        await fake.start(request());
        fake.tick();
        const helpers = makeDeps();
        const service = createDownloadsService(fake, helpers.deps);
        services.push(service);
        expect(service.ready.value).toBe(false);
        await service.whenReady;
        expect(service.ready.value).toBe(true);
        expect(service.entries.value.map((e) => e.downloadId)).toEqual(["d1"]);
        expect(service.progress.value.get("d1")?.bytesTotal).toBeGreaterThan(0);
        expect(service.storage.value?.preferredVolumeId).toBe("internal");
        expect(service.entryFor("post-1")?.downloadId).toBe("d1");
    });

    it("replaces an entry, updates progress, drops a removed one and its progress", async () => {
        const { fake, service } = await setup();
        await service.whenReady;
        await fake.start(request());
        expect(service.entries.value[0].status).toBe("downloading");
        fake.tick();
        expect(service.progress.value.get("d1")?.bytesDone).toBe(2_000_000);
        for (let i = 0; i < 3; i++) fake.tick();
        expect(service.entries.value[0].status).toBe("complete");
        expect(service.progress.value.has("d1")).toBe(false);
        await fake.remove(["d1"]);
        expect(service.entries.value).toEqual([]);
        expect(service.badges.value.has("post-1")).toBe(false);
    });

    it("replaces the storage report and the network when the engine reports them", async () => {
        const { fake, service } = await setup({ engine: { card: true } });
        await service.whenReady;
        fake.setMounted("card-1", false);
        expect(service.storage.value?.volumes.find((v) => v.id === "card-1")?.mounted).toBe(false);
        fake.setNetwork({ metered: true });
        expect(service.network.value).toEqual({ online: true, metered: true });
    });

    it("applies events that arrive before the list after it", async () => {
        let release: () => void = () => undefined;
        const { fake, service } = await setup({
            wrap: (engine) => ({
                ...engine,
                list: () =>
                    new Promise((resolve) => {
                        release = () => resolve({ entries: [], progress: [] });
                    }),
            }),
        });
        await fake.start(request());
        expect(service.entries.value).toEqual([]);
        release();
        await service.whenReady;
        expect(service.entries.value.map((e) => e.downloadId)).toEqual(["d1"]);
    });

    it("keeps the list when the storage report or the network fails", async () => {
        const fake = createFakeEngine();
        await fake.start(request());
        const helpers = makeDeps();
        const service = createDownloadsService(
            {
                ...fake,
                storage: () => Promise.reject(new Error("storage")),
                network: () => Promise.reject(new Error("network")),
            },
            helpers.deps,
        );
        services.push(service);
        await service.whenReady;
        expect(service.ready.value).toBe(true);
        expect(service.entries.value.map((e) => e.downloadId)).toEqual(["d1"]);
        expect(helpers.deps.reportError).toHaveBeenCalledWith(expect.any(Error), "storage");
    });

    it("stays not ready, keeps every pin and asks again when the list fails", async () => {
        vi.useFakeTimers();
        const fake = createFakeEngine();
        await fake.start(request());
        const helpers = makeDeps();
        helpers.pins.add("post-1");
        helpers.pins.add("content-1");
        let fail = true;
        const service = createDownloadsService(
            {
                ...fake,
                list: () => (fail ? Promise.reject(new Error("list")) : fake.list()),
            },
            helpers.deps,
        );
        services.push(service);
        await vi.advanceTimersByTimeAsync(0);
        expect(service.ready.value).toBe(false);
        expect(service.entries.value).toEqual([]);
        expect([...helpers.pins].sort()).toEqual(["content-1", "post-1"]);
        expect(helpers.deps.unpinRetention).not.toHaveBeenCalled();
        await service.lifecycle.recheck();
        expect([...helpers.pins].sort()).toEqual(["content-1", "post-1"]);
        expect(helpers.deps.unpinRetention).not.toHaveBeenCalled();

        fail = false;
        await vi.advanceTimersByTimeAsync(LIST_RETRY_MS);
        await service.whenReady;
        expect(service.ready.value).toBe(true);
        expect(service.entries.value.map((e) => e.downloadId)).toEqual(["d1"]);
        expect([...helpers.pins].sort()).toEqual(["content-1", "post-1"]);
    });

    it("refreshes the storage report when the engine removes a download itself", async () => {
        const { fake, service } = await setup();
        await service.whenReady;
        await fake.start(request());
        for (let i = 0; i < 4; i++) fake.tick();
        await service.refreshStorage();
        const freeBefore = service.storage.value!.volumes[0].freeBytes;
        await fake.revoke("d1", "takedown");
        await flush();
        expect(service.storage.value!.volumes[0].freeBytes).toBeGreaterThan(freeBefore);
    });

    it("keeps an unchanged badge as the same object across a progress tick", async () => {
        const { fake, service } = await setup();
        await service.whenReady;
        await fake.start(request({ downloadId: "d1" }));
        await fake.start(request({ downloadId: "d2", parentId: "post-2" }));
        const before = service.badges.value.get("post-2");
        fake.tick();
        const after = service.badges.value.get("post-2");
        expect(after).toBe(before);
        expect(service.badges.value.get("post-1")).not.toBe(undefined);
    });

    it("lists playable parents and counts those needing attention", async () => {
        const { fake, service } = await setup();
        await service.whenReady;
        await fake.start(request());
        expect(service.playableParentIds.value.has("post-1")).toBe(false);
        fake.tick();
        fake.tick();
        expect(service.playableParentIds.value.has("post-1")).toBe(true);
        fake.fail("d1", "http");
        expect(service.attentionCount.value).toBe(1);
    });

    it("leaves out a download on an unmounted card, a revoked one and one whose key is missing", async () => {
        const { fake, service } = await setup({ engine: { card: true } });
        await service.whenReady;
        await fake.start(request({ volumeId: "card-1" }));
        for (let i = 0; i < 4; i++) fake.tick();
        const playable = () => service.playableParentIds.value.has("post-1");
        expect(playable()).toBe(true);

        fake.setMounted("card-1", false);
        expect(playable()).toBe(false);
        fake.setMounted("card-1", true);
        expect(playable()).toBe(true);

        service.internals.state.applyEntry({ ...fake.entry("d1")!, key: "missing" });
        expect(playable()).toBe(false);
        service.internals.state.applyEntry({ ...fake.entry("d1")!, key: "present" });
        expect(playable()).toBe(true);

        await fake.revoke("d1", "access");
        expect(playable()).toBe(false);
    });

    it("routes every notification tap to My Downloads", async () => {
        const { fake, service, deps } = await setup();
        await service.whenReady;
        fake.tapNotification("d1", "completed");
        fake.tapNotification(null, "attention");
        expect(deps.navigate).toHaveBeenNthCalledWith(1, "/downloads");
        expect(deps.navigate).toHaveBeenNthCalledWith(2, "/downloads");
    });

    it("hands new notification words to every download when the language changes", async () => {
        const { fake, service, language } = await setup();
        await service.whenReady;
        await fake.start(request());
        language.value = "fr";
        await flush();
        await flush();
        expect(fake.texts.get("d1")).toMatchObject({
            title: "Item one",
            completed: "t:downloads.notification.completed",
        });
    });
});

describe("actions", () => {
    it("cancels the chapters to come and forgets a download with none done", async () => {
        const { fake, service, pins } = await setup();
        await service.whenReady;
        await service.openSheet(makeContent(), { context: "downloads" });
        fake.act({
            action: "start",
            selection: { kind: "audio", audioLanguage: "en" },
            chapters: [0, 1, 2],
            meteredConsent: false,
        });
        await flush();
        expect(pins.has("post-1")).toBe(true);
        const id = service.entries.value[0].downloadId;
        await service.cancel(id);
        expect(service.entries.value).toEqual([]);
        await flush();
        expect(pins.has("post-1")).toBe(false);
    });

    it("removes downloads, unpins them and refreshes the storage report", async () => {
        const { fake, service, pins } = await setup();
        await service.whenReady;
        await fake.start(request());
        pins.add("post-1");
        pins.add("content-1");
        for (let i = 0; i < 4; i++) fake.tick();
        const freeBefore = (await fake.storage()).volumes[0].freeBytes;
        const [result] = await service.remove(["d1"]);
        expect(result.removed).toBe(true);
        await flush();
        expect(pins.size).toBe(0);
        expect(service.storage.value!.volumes[0].freeBytes).toBeGreaterThan(freeBefore);
    });

    it("cleans up and reports the bytes freed", async () => {
        const { service } = await setup();
        await service.whenReady;
        expect(await service.cleanUp()).toBe(40_000_000);
        expect(service.storage.value!.volumes[0].reclaimable.orphans).toBe(0);
    });

    it("keeps the preferred volume the engine reports, and reports false when setting it fails", async () => {
        const { fake, service } = await setup({ engine: { card: true } });
        await service.whenReady;
        expect(await service.setPreferredVolume("card-1")).toBe(true);
        expect(service.storage.value?.preferredVolumeId).toBe("card-1");

        vi.spyOn(fake, "setPreferredVolume").mockRejectedValueOnce(new Error("io"));
        expect(await service.setPreferredVolume("internal")).toBe(false);
        expect(service.storage.value?.preferredVolumeId).toBe("card-1");
    });

    it("resumes with the consent it is given, and without it on Wi-Fi", async () => {
        const { fake, service } = await setup({ engine: { network: { metered: true } } });
        await service.whenReady;
        await fake.start(request());
        await service.pause("d1");
        expect(service.entries.value[0].status).toBe("paused");
        await service.resume("d1");
        expect(fake.entry("d1")).toMatchObject({
            status: "waiting",
            reason: "metered",
            meteredConsent: false,
        });
        await service.resume("d1", { meteredConsent: true });
        expect(fake.entry("d1")).toMatchObject({ status: "downloading", meteredConsent: true });
    });

    it("resumes every paused and failed download", async () => {
        const { fake, service } = await setup();
        await service.whenReady;
        await fake.start(request());
        await fake.start(request({ downloadId: "d2", parentId: "post-2" }));
        await fake.pause("d1");
        fake.fail("d2", "http");
        await service.resumeAll();
        expect(fake.entry("d1")?.status).not.toBe("paused");
        expect(fake.entry("d2")?.status).not.toBe("failed");
    });

    it("tells the viewer when a pause fails", async () => {
        const { fake, service, deps } = await setup();
        await service.whenReady;
        await fake.start(request());
        vi.spyOn(fake, "pause").mockRejectedValueOnce(
            Object.assign(new Error("io"), { code: "io" }),
        );
        await service.pause("d1");
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.sheet.action_failed", "error");
        expect(deps.reportError).toHaveBeenCalledWith(expect.any(Error), "pause");
    });

    it("forgets a download the engine no longer holds when removing it", async () => {
        const { fake, service, pins } = await setup();
        await service.whenReady;
        await fake.start(request());
        await service.lifecycle.recheck();
        vi.spyOn(fake, "remove").mockResolvedValueOnce([
            { downloadId: "d1", removed: false, code: "unknown-download", freedBytes: 0 },
        ]);
        await service.remove(["d1"]);
        expect(service.entries.value).toEqual([]);
        expect(pins.has("post-1")).toBe(false);
    });

    it("runs the source check before resuming a download whose source changed", async () => {
        const { fake, service, docs } = await setup();
        docs.set("content-1", makeContent());
        await service.whenReady;
        await fake.start(request());
        fake.fail("d1", "source-changed");
        fake.deferNextCheck();
        await service.resume("d1");
        // Deferred: the same plan would fail again, so it is left failed.
        expect(fake.entry("d1")?.status).toBe("failed");
        await service.resume("d1");
        expect(fake.entry("d1")?.status).not.toBe("failed");
    });

    it("does not resume a download whose source changed when the check cannot run, and says why", async () => {
        const { fake, service, docs, deps } = await setup();
        docs.set("content-1", makeContent());
        await service.whenReady;
        await fake.start(request());
        fake.fail("d1", "source-changed");
        const resume = vi.spyOn(fake, "resume");
        vi.spyOn(fake, "checkSource")
            .mockRejectedValueOnce(Object.assign(new Error("read"), { code: "invalid-source" }))
            .mockRejectedValueOnce(Object.assign(new Error("io"), { code: "io" }));
        await service.resume("d1");
        expect(deps.notify).toHaveBeenLastCalledWith("t:downloads.notice.unreadable", "error");
        await service.resume("d1");
        expect(deps.notify).toHaveBeenLastCalledWith("t:downloads.notice.resume_failed", "error");
        expect(resume).not.toHaveBeenCalled();
        expect(fake.entry("d1")?.status).toBe("failed");
    });

    it("says the item could not be read for every reading failure of the check before a resume", async () => {
        const { fake, service, docs, deps } = await setup();
        docs.set("content-1", makeContent());
        await service.whenReady;
        await fake.start(request());
        fake.fail("d1", "source-gone");
        const resume = vi.spyOn(fake, "resume");
        const check = vi.spyOn(fake, "checkSource");
        for (const code of ["invalid-source", "fetch-failed", "key-required", "decrypt-failed"]) {
            check.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
            vi.mocked(deps.notify).mockClear();
            await service.resume("d1");
            expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.unreadable", "error");
        }
        expect(resume).not.toHaveBeenCalled();
    });

    it("re-checks a takedown before resuming a download whose source is gone", async () => {
        const { fake, service, translations } = await setup();
        await service.whenReady;
        await fake.start(request());
        fake.fail("d1", "source-gone");
        translations.set("post-1", []);
        await service.resume("d1");
        expect(fake.entry("d1")).toBeUndefined();
        expect(service.entries.value).toEqual([]);
    });
});
