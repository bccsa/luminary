import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteReason, DocType } from "luminary-shared";
import type { DownloadStartRequest } from "@/build-time/contracts/downloads/contract";
import { createFakeEngine, type FakeEngine } from "../fakeEngine";
import { createDownloadsService, type DownloadsRuntime } from "../service";
import {
    EXPIRY_REFRESH_MS,
    KEY_FETCH_INTERVAL_MS,
    RATE_LIMIT_WAIT_MS,
    TAKEDOWN_DEBOUNCE_MS,
} from "../lifecycle";
import { flush, grantAll, makeContent, makeDeps, makeParent } from "./helpers";

const request = (
    n: number,
    overrides: Partial<DownloadStartRequest> = {},
): DownloadStartRequest => ({
    downloadId: `d${n}`,
    parentId: `post-${n}`,
    parentType: "post",
    source: {
        masterUrl: "https://cdn.example.org/m.m3u8",
        keyHex: "ab".repeat(16),
        artworkUrls: [],
    },
    selection: { kind: "audio", audioLanguage: "en" },
    chapterIndices: [0, 1, 2],
    content: {
        title: `Item ${n}`,
        contentId: `content-${n}`,
        language: "lang-eng",
        memberOf: ["group-public"],
        durationSeconds: 0,
    },
    texts: { title: `Item ${n}` },
    volumeId: "internal",
    meteredConsent: false,
    expiresAt: null,
    ...overrides,
});

/** Downloads already on the device when the app starts. */
async function seed(fake: FakeEngine, count: number) {
    for (let n = 1; n <= count; n++) {
        await fake.start(request(n));
        for (let i = 0; i < 4; i++) fake.tick();
    }
}

let services: DownloadsRuntime[] = [];
afterEach(() => {
    services.forEach((s) => s.dispose());
    services = [];
    vi.useRealTimers();
});

async function setup(
    count = 1,
    prepare?: (h: ReturnType<typeof makeDeps>, fake: FakeEngine) => void | Promise<void>,
) {
    const fake = createFakeEngine();
    await seed(fake, count);
    const helpers = makeDeps();
    // The app stores content docs, which carry their parent's groups.
    for (let n = 1; n <= count; n++) {
        helpers.docs.set(
            `content-${n}`,
            makeContent({ _id: `content-${n}`, parentId: `post-${n}` }),
        );
    }
    await prepare?.(helpers, fake);
    const service = createDownloadsService(fake, helpers.deps);
    services.push(service);
    await service.whenReady;
    return { fake, service, lifecycle: service.internals.lifecycle, ...helpers };
}

describe("access", () => {
    it("ignores an empty access map", async () => {
        const { fake, accessMap } = await setup();
        const revoke = vi.spyOn(fake, "revoke");
        accessMap.value = {};
        await flush();
        await flush();
        expect(revoke).not.toHaveBeenCalled();
        expect(fake.entry("d1")?.status).toBe("complete");
    });

    it("revokes for access when Download is no longer granted", async () => {
        const { fake, accessMap } = await setup();
        accessMap.value = { "group-public": { post: { view: true, download: false } } };
        await flush();
        await flush();
        expect(fake.entry("d1")).toMatchObject({
            status: "revoked",
            reason: "access",
            key: "shredded",
        });
    });

    it("revokes for access when View is no longer granted", async () => {
        const { fake, accessMap } = await setup();
        accessMap.value = { "group-public": { post: { view: false, download: true } } };
        await flush();
        await flush();
        expect(fake.entry("d1")?.status).toBe("revoked");
    });

    it("checks against the stored content's groups, else the snapshot's", async () => {
        const { fake, accessMap, docs } = await setup(2);
        docs.set("content-1", makeContent({ memberOf: ["group-other"] }));
        docs.delete("content-2");
        accessMap.value = grantAll(["group-public"]);
        await flush();
        await flush();
        expect(fake.entry("d1")?.status).toBe("revoked");
        // No content doc on the device: the snapshot's groups still grant it.
        expect(fake.entry("d2")?.status).toBe("complete");
    });

    it("takes the groups of the stored doc updated last: a newer sibling translation over the own copy", async () => {
        const { fake, accessMap, docs } = await setup();
        docs.set("content-1", makeContent({ updatedTimeUtc: 10, memberOf: ["group-download"] }));
        docs.set(
            "content-1-fr",
            makeContent({ _id: "content-1-fr", updatedTimeUtc: 20, memberOf: ["group-view"] }),
        );
        accessMap.value = {
            "group-download": { post: { view: true, download: true } },
            "group-view": { post: { view: true } },
        };
        await flush();
        await flush();
        expect(fake.entry("d1")).toMatchObject({ status: "revoked", reason: "access" });
        expect(fake.entry("d1")?.content.memberOf).toEqual(["group-view"]);
    });

    it("takes a stored parent doc's groups when it was updated last, and the own copy's when it was", async () => {
        const { fake, accessMap, docs } = await setup(2);
        docs.set("content-1", makeContent({ updatedTimeUtc: 10, memberOf: ["group-view"] }));
        docs.set("post-1", { ...makeParent("post-1", ["group-download"]), updatedTimeUtc: 30 });
        docs.set(
            "content-2",
            makeContent({
                _id: "content-2",
                parentId: "post-2",
                updatedTimeUtc: 30,
                memberOf: ["group-download"],
            }),
        );
        docs.set("post-2", { ...makeParent("post-2", ["group-view"]), updatedTimeUtc: 10 });
        accessMap.value = {
            "group-download": { post: { view: true, download: true } },
            "group-view": { post: { view: true } },
        };
        await flush();
        await flush();
        expect(fake.entry("d1")?.status).toBe("complete");
        expect(fake.entry("d2")?.status).toBe("complete");
    });

    it("takes the content's own copy on a tie with a translation", async () => {
        const { fake, accessMap, docs } = await setup();
        docs.set("content-1", makeContent({ updatedTimeUtc: 20, memberOf: ["group-download"] }));
        docs.set(
            "content-1-fr",
            makeContent({ _id: "content-1-fr", updatedTimeUtc: 20, memberOf: ["group-view"] }),
        );
        accessMap.value = {
            "group-download": { post: { view: true, download: true } },
            "group-view": { post: { view: true } },
        };
        await flush();
        await flush();
        expect(fake.entry("d1")?.status).toBe("complete");
        expect(fake.entry("d1")?.content.memberOf).toEqual(["group-download"]);
    });

    it("keeps the snapshot's groups current from the stored content", async () => {
        const { fake, accessMap, docs } = await setup();
        docs.set("content-1", makeContent({ memberOf: ["group-public", "group-other"] }));
        accessMap.value = grantAll(["group-public", "group-other"]);
        await flush();
        await flush();
        expect(fake.entry("d1")?.content.memberOf).toEqual(["group-public", "group-other"]);
        // Later, without the stored doc, the kept groups decide.
        docs.delete("content-1");
        accessMap.value = grantAll(["group-other"]);
        await flush();
        await flush();
        expect(fake.entry("d1")?.status).toBe("complete");
    });

    it("keeps a revoked download's groups current, so a check without the stored doc cannot restore it", async () => {
        const { fake, service, accessMap, docs } = await setup();
        docs.set("content-1", makeContent({ memberOf: ["group-b"] }));
        accessMap.value = { ...grantAll(["group-public"]), "group-b": { post: { view: true } } };
        await flush();
        await flush();
        expect(fake.entry("d1")).toMatchObject({ status: "revoked", reason: "access" });
        expect(fake.entry("d1")?.content.memberOf).toEqual(["group-b"]);
        docs.delete("content-1");
        await service.lifecycle.recheck();
        await flush();
        expect(fake.entry("d1")?.status).toBe("revoked");
    });

    it("checks against the newest map when maps change during a check", async () => {
        vi.useFakeTimers();
        const { fake, accessMap } = await setup(3);
        accessMap.value = { "group-public": { post: { view: true, download: false } } };
        await Promise.resolve();
        await Promise.resolve();
        accessMap.value = grantAll();
        await vi.advanceTimersByTimeAsync(KEY_FETCH_INTERVAL_MS * 4);
        for (const id of ["d1", "d2", "d3"]) {
            expect(fake.entry(id)).toMatchObject({ status: "complete", key: "present" });
        }
    });

    it("revokes for access, never removes, when a permission change moves the parent to groups without View", async () => {
        vi.useFakeTimers();
        const { fake, docs, translations, deleteByCommand, isConnected } = await setup();
        // The delete command takes the stored docs away, as the database does.
        docs.delete("content-1");
        translations.set("post-1", []);
        deleteByCommand([
            {
                docId: "content-1",
                docType: DocType.Content,
                deleteReason: DeleteReason.PermissionChange,
                parentId: "post-1",
                newMemberOf: ["group-hidden"],
            },
        ]);
        await vi.advanceTimersByTimeAsync(0);
        expect(fake.entry("d1")).toMatchObject({ status: "revoked", reason: "access" });
        expect(fake.entry("d1")?.content.memberOf).toEqual(["group-hidden"]);

        await vi.advanceTimersByTimeAsync(TAKEDOWN_DEBOUNCE_MS + 10);
        isConnected.value = false;
        await vi.advanceTimersByTimeAsync(0);
        isConnected.value = true;
        await vi.advanceTimersByTimeAsync(0);
        expect(fake.entry("d1")).toMatchObject({ status: "revoked", reason: "access" });
    });

    it("revokes for access at once when a group change keeps View without Download", async () => {
        const { fake, docs, docsWritten } = await setup(1, (h) => {
            h.accessMap.value = {
                ...grantAll(["group-public"]),
                "group-viewers": { post: { view: true, download: false } },
            };
        });
        const revoke = vi.spyOn(fake, "revoke");
        docs.set(
            "content-1",
            makeContent({
                _id: "content-1",
                updatedTimeUtc: 2,
                memberOf: ["group-viewers"],
            }),
        );
        docsWritten(["post-1"]);
        await flush();
        await flush();
        expect(revoke).toHaveBeenCalledWith("d1", "access");
        expect(fake.entry("d1")).toMatchObject({ status: "revoked", reason: "access" });
    });

    it("leaves a download alone on a doc write that changes none of its groups", async () => {
        const { fake, docsWritten } = await setup();
        const update = vi.spyOn(fake, "update");
        const revoke = vi.spyOn(fake, "revoke");
        docsWritten(["post-1"]);
        await flush();
        await flush();
        expect(update).not.toHaveBeenCalled();
        expect(revoke).not.toHaveBeenCalled();
    });

    it("does not bring back a download the engine deleted for its passed expiry while updating it", async () => {
        const past = Date.now() - 1_000;
        // Offline, so only the access check updates it: the stored doc's groups differ from the snapshot's.
        const { service, fake } = await setup(0, async (h, engine) => {
            await engine.start(request(1, { expiresAt: past }));
            for (let i = 0; i < 4; i++) engine.tick();
            h.isConnected.value = false;
            h.accessMap.value = grantAll(["group-public", "group-other"]);
            h.docs.set(
                "content-1",
                makeContent({ _id: "content-1", parentId: "post-1", memberOf: ["group-other"] }),
            );
        });
        await flush();
        expect(fake.entry("d1")).toBeUndefined();
        expect(service.entries.value).toEqual([]);
        expect(service.playableParentIds.value.has("post-1")).toBe(false);
    });

    it("does not bring back a download the engine deleted while its expiry was being written", async () => {
        const { service, fake } = await setup(0, async (_h, engine) => {
            // The published doc has no expiry, so the stored one is cleared.
            await engine.start(request(1, { expiresAt: Date.now() + 60_000 }));
            for (let i = 0; i < 4; i++) engine.tick();
            const update = engine.update.bind(engine);
            // The download goes while the update is under way: the engine reports it before it answers.
            vi.spyOn(engine, "update").mockImplementationOnce(async (downloadId, patch) => {
                const last = await update(downloadId, patch);
                await engine.remove([downloadId]);
                return last;
            });
        });
        await flush();
        expect(fake.entry("d1")).toBeUndefined();
        expect(service.entries.value).toEqual([]);
    });

    it("restores a revoked download with its key when access returns", async () => {
        const { fake, accessMap, deps } = await setup();
        accessMap.value = { "group-public": { post: { view: true } } };
        await flush();
        await flush();
        expect(fake.entry("d1")?.status).toBe("revoked");
        accessMap.value = grantAll();
        await flush();
        await flush();
        await flush();
        expect(deps.fetchKey).toHaveBeenCalledWith("post-1");
        expect(fake.entry("d1")).toMatchObject({ status: "complete", key: "present" });
    });

    it("puts a missing key back without restoring anything", async () => {
        const { fake, service, lifecycle } = await setup();
        const putKey = vi.spyOn(fake, "putKey");
        const restore = vi.spyOn(fake, "restore");
        service.internals.state.applyEntry({ ...fake.entry("d1")!, key: "missing" });
        lifecycle.queueKeyFetch("d1");
        await flush();
        await flush();
        expect(putKey).toHaveBeenCalledWith("d1", "ab".repeat(16));
        expect(restore).not.toHaveBeenCalled();
    });
});

describe("the key fetch queue", () => {
    async function revokedSetup(count: number) {
        const ctx = await setup(count, async (h, fake) => {
            for (let n = 1; n <= count; n++) await fake.revoke(`d${n}`, "access");
            // Not loaded yet at boot, so the grants arrive as a change the test controls.
            h.accessMap.value = {};
        });
        return ctx;
    }

    for (const outcome of ["rateLimited", "unreachable", "denied"] as const) {
        it(`never shreds, revokes or stores anything on a ${outcome} answer`, async () => {
            vi.useFakeTimers();
            const { fake, deps, service, lifecycle, accessMap } = await setup(
                2,
                async (h, fake) => {
                    await fake.revoke("d2", "access");
                    h.accessMap.value = {};
                },
            );
            const revoke = vi.spyOn(fake, "revoke");
            const putKey = vi.spyOn(fake, "putKey");
            const restore = vi.spyOn(fake, "restore");
            const fetchKey = vi.mocked(deps.fetchKey);
            fetchKey.mockClear();
            fetchKey.mockResolvedValue({ outcome });
            service.internals.state.applyEntry({ ...fake.entry("d1")!, key: "missing" });
            // Revoked with access granted, and a missing key: both ask.
            accessMap.value = grantAll();
            await vi.advanceTimersByTimeAsync(0);
            lifecycle.queueKeyFetch("d1");
            await vi.advanceTimersByTimeAsync(RATE_LIMIT_WAIT_MS * 2);
            expect(fetchKey).toHaveBeenCalledWith("post-1");
            // A rate-limited key is asked for again first, so the rest wait behind it.
            if (outcome !== "rateLimited") expect(fetchKey).toHaveBeenCalledWith("post-2");
            expect(revoke).not.toHaveBeenCalled();
            expect(putKey).not.toHaveBeenCalled();
            expect(restore).not.toHaveBeenCalled();
            expect(service.internals.state.byId("d1")).toMatchObject({
                status: "complete",
                key: "missing",
            });
            expect(fake.entry("d2")).toMatchObject({ status: "revoked", key: "shredded" });
        });
    }

    it("fetches nothing, and restores nothing, once access is gone again", async () => {
        vi.useFakeTimers();
        const { deps, accessMap, fake } = await revokedSetup(2);
        const fetchKey = vi.mocked(deps.fetchKey);
        fetchKey.mockClear();
        accessMap.value = grantAll();
        await vi.advanceTimersByTimeAsync(0);
        expect(fake.entry("d1")?.status).toBe("complete");
        accessMap.value = { "group-public": { post: { view: true, download: false } } };
        await vi.advanceTimersByTimeAsync(KEY_FETCH_INTERVAL_MS * 2);
        expect(fetchKey).toHaveBeenCalledTimes(1);
        expect(fake.entry("d2")).toMatchObject({ status: "revoked", key: "shredded" });
    });

    it("stores no key that arrives after access went", async () => {
        const { deps, accessMap, fake, service, lifecycle } = await setup();
        const putKey = vi.spyOn(fake, "putKey");
        vi.mocked(deps.fetchKey).mockImplementation(async () => {
            accessMap.value = { "group-public": { post: { view: true, download: false } } };
            return { outcome: "key", keyHex: "ab".repeat(16) };
        });
        service.internals.state.applyEntry({ ...fake.entry("d1")!, key: "missing" });
        lifecycle.queueKeyFetch("d1", true);
        await flush();
        await flush();
        expect(putKey).not.toHaveBeenCalled();
    });

    it("asks for no key while the access map is not loaded", async () => {
        const { deps, accessMap, fake, service, lifecycle } = await setup();
        accessMap.value = {};
        const fetchKey = vi.mocked(deps.fetchKey);
        fetchKey.mockClear();
        service.internals.state.applyEntry({ ...fake.entry("d1")!, key: "missing" });
        lifecycle.queueKeyFetch("d1", true);
        await flush();
        await flush();
        expect(fetchKey).not.toHaveBeenCalled();
    });

    it("fetches about one key every 5 s", async () => {
        vi.useFakeTimers();
        const { deps, accessMap } = await revokedSetup(3);
        const fetchKey = vi.mocked(deps.fetchKey);
        fetchKey.mockClear();
        accessMap.value = grantAll();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchKey).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(KEY_FETCH_INTERVAL_MS - 10);
        expect(fetchKey).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(20);
        expect(fetchKey).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(KEY_FETCH_INTERVAL_MS);
        expect(fetchKey).toHaveBeenCalledTimes(3);
        expect(fetchKey.mock.calls.map((c) => c[0])).toEqual(["post-1", "post-2", "post-3"]);
    });

    it("puts a fetch the player needs ahead of the rest", async () => {
        vi.useFakeTimers();
        const { deps, accessMap, lifecycle } = await revokedSetup(3);
        const fetchKey = vi.mocked(deps.fetchKey);
        fetchKey.mockClear();
        accessMap.value = grantAll();
        await vi.advanceTimersByTimeAsync(0);
        lifecycle.queueKeyFetch("d3", true);
        await vi.advanceTimersByTimeAsync(KEY_FETCH_INTERVAL_MS * 2);
        expect(fetchKey.mock.calls.map((c) => c[0])).toEqual(["post-1", "post-3", "post-2"]);
    });

    it("waits a minute after a rate-limit answer, then asks again", async () => {
        vi.useFakeTimers();
        const { deps, accessMap, fake } = await revokedSetup(1);
        const fetchKey = vi.mocked(deps.fetchKey);
        fetchKey.mockClear();
        fetchKey.mockResolvedValueOnce({ outcome: "rateLimited" });
        accessMap.value = grantAll();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchKey).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(RATE_LIMIT_WAIT_MS - 100);
        expect(fetchKey).toHaveBeenCalledTimes(1);
        expect(fake.entry("d1")?.status).toBe("revoked");
        await vi.advanceTimersByTimeAsync(200);
        expect(fetchKey).toHaveBeenCalledTimes(2);
        expect(fake.entry("d1")?.status).toBe("complete");
    });
});

describe("expiry", () => {
    it("is the latest expiry across the translations, written only when it changes", async () => {
        const future = Date.now() + 10 * 86_400_000;
        const { fake, translations, lifecycle } = await setup(1, (h) => {
            h.translations.set("post-1", [
                makeContent({ _id: "a", expiryDate: future }),
                makeContent({ _id: "b", expiryDate: future + 1000 }),
            ]);
        });
        expect(fake.entry("d1")?.expiresAt).toBe(future + 1000);
        const update = vi.spyOn(fake, "update");
        await lifecycle.recheckParent("post-1");
        expect(update).not.toHaveBeenCalled();

        translations.set("post-1", [
            makeContent({ _id: "a", expiryDate: future }),
            makeContent({ _id: "b" }),
        ]);
        await lifecycle.recheckParent("post-1");
        expect(fake.entry("d1")?.expiresAt).toBeNull();
    });

    it("counts expired translations, and revokes as expired when every one has passed", async () => {
        const { fake, translations, lifecycle } = await setup();
        translations.set("post-1", [makeContent({ expiryDate: Date.now() - 1000 })]);
        expect(await lifecycle.recheckParent("post-1")).toBe("expired");
        expect(fake.entry("d1")).toBeUndefined();
    });

    it("refreshes on connect and every 6 hours", async () => {
        vi.useFakeTimers();
        const { deps, isConnected } = await setup();
        const query = vi.mocked(deps.queryTranslations);
        query.mockClear();
        isConnected.value = false;
        await vi.advanceTimersByTimeAsync(0);
        isConnected.value = true;
        await vi.advanceTimersByTimeAsync(0);
        expect(query).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(EXPIRY_REFRESH_MS);
        expect(query).toHaveBeenCalledTimes(2);
    });
});

describe("takedown", () => {
    it("revokes after a delete command for the parent, once the re-check finds nothing", async () => {
        vi.useFakeTimers();
        const { fake, translations, deleteByCommand } = await setup();
        translations.set("post-1", []);
        deleteByCommand([
            {
                docId: "content-1",
                docType: DocType.Content,
                deleteReason: DeleteReason.StatusChange,
                parentId: "post-1",
            },
        ]);
        await vi.advanceTimersByTimeAsync(TAKEDOWN_DEBOUNCE_MS - 10);
        expect(fake.entry("d1")).toBeDefined();
        await vi.advanceTimersByTimeAsync(20);
        expect(fake.entry("d1")).toBeUndefined();
    });

    it("re-checks every download on foreground and on a doc update", async () => {
        vi.useFakeTimers();
        const { deps, foreground, docsWritten } = await setup(2);
        const query = vi.mocked(deps.queryTranslations);
        query.mockClear();
        foreground();
        await vi.advanceTimersByTimeAsync(0);
        expect(query.mock.calls.map((c) => c[0])).toEqual(["post-1", "post-2"]);
        docsWritten(["post-2"]);
        await vi.advanceTimersByTimeAsync(TAKEDOWN_DEBOUNCE_MS + 10);
        expect(query.mock.calls.map((c) => c[0])).toEqual(["post-1", "post-2", "post-2"]);
    });

    it("takes down on a re-check only when a later connection answers the same", async () => {
        vi.useFakeTimers();
        const { fake, translations, foreground, isConnected } = await setup(2);
        translations.set("post-1", []);
        // A successful empty answer is also what a caller gets before its credentials apply.
        foreground();
        await vi.advanceTimersByTimeAsync(0);
        foreground();
        await vi.advanceTimersByTimeAsync(0);
        expect(fake.entry("d1")?.status).toBe("complete");

        isConnected.value = false;
        await vi.advanceTimersByTimeAsync(0);
        isConnected.value = true;
        await vi.advanceTimersByTimeAsync(0);
        expect(fake.entry("d1")).toBeUndefined();
        expect(fake.entry("d2")).toBeDefined();
    });

    it("forgets an empty answer once an answer lists a translation again", async () => {
        vi.useFakeTimers();
        const { fake, translations, foreground, isConnected } = await setup();
        translations.set("post-1", []);
        foreground();
        await vi.advanceTimersByTimeAsync(0);
        translations.delete("post-1");
        foreground();
        await vi.advanceTimersByTimeAsync(0);
        translations.set("post-1", []);
        isConnected.value = false;
        await vi.advanceTimersByTimeAsync(0);
        isConnected.value = true;
        await vi.advanceTimersByTimeAsync(0);
        expect(fake.entry("d1")?.status).toBe("complete");
    });

    it("does not count a permission change as a takedown", async () => {
        vi.useFakeTimers();
        const { fake, translations, deleteByCommand } = await setup();
        translations.set("post-1", []);
        deleteByCommand([
            {
                docId: "content-1",
                docType: DocType.Content,
                deleteReason: DeleteReason.PermissionChange,
                parentId: "post-1",
            },
        ]);
        await vi.advanceTimersByTimeAsync(TAKEDOWN_DEBOUNCE_MS + 10);
        expect(fake.entry("d1")?.status).toBe("complete");
    });

    it("counts an answer that did not succeed as no answer, neither confirming nor forgetting an empty one", async () => {
        vi.useFakeTimers();
        const { fake, translations, foreground, isConnected } = await setup();
        translations.set("post-1", []);
        foreground();
        await vi.advanceTimersByTimeAsync(0);
        const reconnect = async () => {
            isConnected.value = false;
            await vi.advanceTimersByTimeAsync(0);
            isConnected.value = true;
            await vi.advanceTimersByTimeAsync(0);
        };
        translations.set("post-1", undefined);
        await reconnect();
        expect(fake.entry("d1")?.status).toBe("complete");
        translations.set("post-1", []);
        await reconnect();
        expect(fake.entry("d1")).toBeUndefined();
    });

    it("never revokes on an answer it cannot trust", async () => {
        const { fake, translations, lifecycle } = await setup();
        translations.set("post-1", undefined);
        expect(await lifecycle.recheckParent("post-1")).toBe("unknown");
        expect(fake.entry("d1")?.status).toBe("complete");
    });

    it("never revokes because a document is merely missing on the device", async () => {
        vi.useFakeTimers();
        const { fake, docs, docsWritten, lifecycle } = await setup();
        docs.delete("post-1");
        docs.delete("content-1");
        docsWritten(["post-1"]);
        await vi.advanceTimersByTimeAsync(TAKEDOWN_DEBOUNCE_MS + 10);
        await lifecycle.checkAccess();
        expect(fake.entry("d1")?.status).toBe("complete");
    });

    it("leaves a viewer who lost access to the access map, not to a takedown", async () => {
        const { fake, translations, lifecycle, accessMap } = await setup();
        translations.set("post-1", []);
        accessMap.value = { "group-public": { post: { view: false } } };
        expect(await lifecycle.recheckParent("post-1")).toBe("unknown");
        expect(fake.entry("d1")).toBeDefined();
    });
});

describe("retention pins", () => {
    it("reconciles pins at boot: every download has its pins, no pin is left without one", async () => {
        const { pins } = await setup(1, (h) => {
            h.pins.add("post-gone");
            h.pins.add("content-gone");
        });
        expect([...pins].sort()).toEqual(["content-1", "post-1"]);
    });

    it("removes the pins when the engine reports the download removed", async () => {
        const { pins, fake } = await setup();
        expect(pins.has("post-1")).toBe(true);
        await fake.remove(["d1"]);
        await flush();
        expect(pins.size).toBe(0);
    });

    it("puts the pins back on a re-check, after local data was cleared", async () => {
        const { pins, service } = await setup();
        pins.clear();
        await service.lifecycle.recheck();
        expect([...pins].sort()).toEqual(["content-1", "post-1"]);
    });

    it("keeps a download being played on delete-local-data, and resolves with it, telling nobody", async () => {
        const { fake, service, deps } = await setup(2);
        await service.player.open(makeContent(), { preferOnline: false });
        expect(fake.sessions.size).toBe(1);
        expect(await service.lifecycle.removeAll()).toEqual({ kept: ["d1"], playing: "d1" });
        expect(service.entries.value.map((e) => e.downloadId)).toEqual(["d1"]);
        expect(deps.notify).not.toHaveBeenCalled();
    });

    it("resolves with a download the engine failed to delete too, and reports the failure", async () => {
        const { fake, service, deps } = await setup(2);
        vi.spyOn(fake, "remove").mockResolvedValueOnce([
            { downloadId: "d1", removed: false, code: "io", freedBytes: 0 },
        ]);
        expect(await service.lifecycle.removeAll()).toEqual({ kept: ["d1"] });
        expect(service.entries.value.map((e) => e.downloadId)).toContain("d1");
        expect(deps.reportError).toHaveBeenCalledWith(expect.any(Error), "remove-all");
        expect(deps.notify).not.toHaveBeenCalled();
    });

    it("keeps nothing the engine does not hold, and forgets it", async () => {
        const { fake, service, deps } = await setup(2);
        vi.spyOn(fake, "remove").mockResolvedValueOnce([
            { downloadId: "d1", removed: false, code: "unknown-download", freedBytes: 0 },
        ]);
        expect(await service.lifecycle.removeAll()).toEqual({ kept: [] });
        expect(service.entries.value.map((e) => e.downloadId)).not.toContain("d1");
        expect(deps.reportError).not.toHaveBeenCalled();
    });

    it("keeps every download, and reports it, when the engine fails the whole removal", async () => {
        const { fake, service, deps } = await setup(2);
        vi.spyOn(fake, "remove").mockRejectedValueOnce(new Error("io"));
        const before = service.entries.value.map((e) => e.downloadId);
        expect(await service.lifecycle.removeAll()).toEqual({ kept: before });
        expect(service.entries.value.map((e) => e.downloadId)).toEqual(before);
        expect(deps.reportError).toHaveBeenCalledWith(expect.any(Error), "remove-all");
    });

    it("resolves with nothing kept when there is nothing to remove", async () => {
        const { service } = await setup(0);
        expect(await service.lifecycle.removeAll()).toEqual({ kept: [] });
    });

    it("removes every download and its pins for delete-local-data", async () => {
        const { pins, service } = await setup(2);
        expect(service.lifecycle.totalBytes.value).toBeGreaterThan(0);
        expect(await service.lifecycle.removeAll()).toEqual({ kept: [] });
        await flush();
        expect(service.entries.value).toEqual([]);
        expect(pins.size).toBe(0);
        expect(service.lifecycle.totalBytes.value).toBe(0);
    });
});

describe("source checks", () => {
    it("checks a deferred download again when its playback session closes", async () => {
        const { fake, service, docs, deps } = await setup();
        docs.set("content-1", makeContent());
        fake.deferNextCheck();
        const result = await service.internals.lifecycle.checkSource(fake.entry("d1")!);
        expect(result).toMatchObject({ deferredChapters: [0] });
        expect(deps.notify).not.toHaveBeenCalled();

        const checkSource = vi.spyOn(fake, "checkSource");
        service.internals.lifecycle.sessionClosed();
        await flush();
        await flush();
        expect(checkSource).toHaveBeenCalledTimes(1);
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.chapters_replaced", "info");
        expect(fake.entry("d1")?.status).not.toBe("complete");
    });

    it("keeps checking a deferred download until a check goes through", async () => {
        const { fake, service, deps } = await setup();
        const playback = await service.player.open(makeContent(), { preferOnline: false });
        fake.deferNextCheck();
        await service.internals.lifecycle.checkSource(fake.entry("d1")!);
        const checkSource = vi.spyOn(fake, "checkSource");
        // Still playing: deferred again, and still pending.
        service.internals.lifecycle.sessionClosed();
        await flush();
        expect(checkSource).toHaveBeenCalledTimes(1);
        await playback?.close();
        await flush();
        await flush();
        expect(checkSource).toHaveBeenCalledTimes(2);
        expect(deps.notify).toHaveBeenCalledWith("t:downloads.notice.chapters_replaced", "info");
        // Gone through: nothing is pending any more.
        service.internals.lifecycle.sessionClosed();
        await flush();
        expect(checkSource).toHaveBeenCalledTimes(2);
    });

    it("checks a downloaded item opened online at most once a day", async () => {
        const { fake, service, docs } = await setup();
        docs.set("content-1", makeContent());
        const checkSource = vi.spyOn(fake, "checkSource");
        service.internals.state.applyEntry({
            ...fake.entry("d1")!,
            lastSourceCheckAt: Date.now() - 2 * 86_400_000,
        });
        const playback = await service.player.open(makeContent(), { preferOnline: false });
        await flush();
        expect(checkSource).toHaveBeenCalledTimes(1);
        await playback?.close();
        await service.player.open(makeContent(), { preferOnline: false });
        await flush();
        expect(checkSource).toHaveBeenCalledTimes(1);
    });

    it("checks a download saved without a picture once on open, however recent its last check", async () => {
        const { fake, service, docs } = await setup();
        docs.set("content-1", makeContent());
        const checkSource = vi.spyOn(fake, "checkSource");
        const entry = fake.entry("d1")!;
        service.internals.state.applyEntry({
            ...entry,
            content: { ...entry.content, artwork: undefined },
            lastSourceCheckAt: Date.now(),
        });
        const playback = await service.player.open(makeContent(), { preferOnline: false });
        await flush();
        expect(checkSource).toHaveBeenCalledTimes(1);
        await playback?.close();
        await service.player.open(makeContent(), { preferOnline: false });
        await flush();
        expect(checkSource).toHaveBeenCalledTimes(1);
    });

    it("leaves a recently checked download with a picture alone on open", async () => {
        const { fake, service, docs } = await setup();
        docs.set("content-1", makeContent());
        const checkSource = vi.spyOn(fake, "checkSource");
        const entry = fake.entry("d1")!;
        service.internals.state.applyEntry({
            ...entry,
            content: { ...entry.content, artwork: "item/art/cover.jpg" },
            lastSourceCheckAt: Date.now(),
        });
        await service.player.open(makeContent(), { preferOnline: false });
        await flush();
        expect(checkSource).not.toHaveBeenCalled();
    });

    it("reports a check that could not run, and whether the engine could not read the source", async () => {
        const { fake, service, docs, deps } = await setup();
        docs.set("content-1", makeContent());
        const checkSource = vi.spyOn(fake, "checkSource");
        for (const code of ["invalid-source", "fetch-failed", "key-required", "decrypt-failed"]) {
            checkSource.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
            expect(await service.internals.lifecycle.checkSource(fake.entry("d1")!)).toEqual({
                failed: true,
                unreadable: true,
            });
        }
        checkSource.mockRejectedValueOnce(Object.assign(new Error("io"), { code: "io" }));
        expect(await service.internals.lifecycle.checkSource(fake.entry("d1")!)).toEqual({
            failed: true,
            unreadable: false,
        });
        vi.mocked(deps.resolveSource).mockRejectedValueOnce(new Error("no key"));
        expect(await service.internals.lifecycle.checkSource(fake.entry("d1")!)).toEqual({
            failed: true,
            unreadable: false,
        });
    });

    it("checks a source that is gone as a takedown", async () => {
        const { fake, service, docs, translations } = await setup();
        docs.set("content-1", makeContent());
        vi.spyOn(fake, "checkSource").mockResolvedValue({
            replacedChapters: [],
            deferredChapters: [],
            sideFilesRefreshed: false,
            gone: true,
        });
        translations.set("post-1", []);
        await service.internals.lifecycle.checkSource(fake.entry("d1")!);
        expect(fake.entry("d1")).toBeUndefined();
    });
});
