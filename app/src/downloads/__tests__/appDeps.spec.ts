import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import waitForExpect from "wait-for-expect";
import { createApp } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { db, DocType, isConnected, PublishStatus } from "luminary-shared";
import { createAppDeps } from "../appDeps";
import { makeContent, makeParent } from "./helpers";

const mocks = vi.hoisted(() => ({
    queryRemote: vi.fn(),
    queryRemoteOutcome: vi.fn(),
    fetchHlsKeyOutcome: vi.fn(),
}));

// A Proxy keeps the module's live bindings, such as `db`, which is assigned after the module loads.
vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    return new Proxy(actual, {
        get(target, prop, receiver) {
            if (prop in mocks) return mocks[prop as keyof typeof mocks];
            return Reflect.get(target, prop, receiver);
        },
    });
});

function appDeps() {
    const app = createApp({});
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    return { app, deps: createAppDeps({ app, router }) };
}

beforeEach(async () => {
    await db.docs.clear();
    isConnected.value = true;
    mocks.queryRemote.mockReset();
    mocks.queryRemoteOutcome.mockReset();
    mocks.fetchHlsKeyOutcome.mockReset();
});

afterEach(() => {
    isConnected.value = false;
});

describe("queryTranslations", () => {
    it("asks nothing while disconnected", async () => {
        isConnected.value = false;
        expect(await appDeps().deps.queryTranslations("post-1")).toBeUndefined();
        expect(mocks.queryRemoteOutcome).not.toHaveBeenCalled();
    });

    it("asks for every translation of the parent, expired ones included", async () => {
        const docs = [makeContent()];
        mocks.queryRemoteOutcome.mockResolvedValue({ ok: true, docs });
        expect(await appDeps().deps.queryTranslations("post-1")).toEqual(docs);
        expect(mocks.queryRemoteOutcome).toHaveBeenCalledWith({
            selector: { type: DocType.Content, parentId: "post-1" },
            $sort: [{ publishDate: "desc" }],
            use_index: "content-parentId-publishDate-index",
            includeExpired: true,
            identifier: "downloads",
        });
    });

    it("passes a successful empty answer on, with no control query", async () => {
        mocks.queryRemoteOutcome.mockResolvedValue({ ok: true, docs: [] });
        expect(await appDeps().deps.queryTranslations("post-1")).toEqual([]);
        expect(mocks.queryRemoteOutcome).toHaveBeenCalledTimes(1);
        expect(mocks.queryRemote).not.toHaveBeenCalled();
    });

    it("distrusts an empty answer while a live translation is stored", async () => {
        mocks.queryRemoteOutcome.mockResolvedValue({ ok: true, docs: [] });
        await db.docs.put(makeContent());
        expect(await appDeps().deps.queryTranslations("post-1")).toBeUndefined();
    });

    it("counts a stored translation with a null expiry as live", async () => {
        mocks.queryRemoteOutcome.mockResolvedValue({ ok: true, docs: [] });
        await db.docs.put(makeContent({ expiryDate: null as unknown as number }));
        expect(await appDeps().deps.queryTranslations("post-1")).toBeUndefined();
    });

    it("passes an empty answer on when the stored translations are expired or unpublished", async () => {
        mocks.queryRemoteOutcome.mockResolvedValue({ ok: true, docs: [] });
        await db.docs.bulkPut([
            makeContent({ expiryDate: 1 }),
            makeContent({ _id: "content-2", status: PublishStatus.Draft }),
        ]);
        expect(await appDeps().deps.queryTranslations("post-1")).toEqual([]);
    });

    it("gives no answer for a request that did not succeed", async () => {
        mocks.queryRemoteOutcome.mockResolvedValueOnce({ ok: false, status: 500 });
        expect(await appDeps().deps.queryTranslations("post-1")).toBeUndefined();
        mocks.queryRemoteOutcome.mockResolvedValueOnce({ ok: false });
        expect(await appDeps().deps.queryTranslations("post-1")).toBeUndefined();
    });

    it("gives no answer when the socket dropped while it was asked", async () => {
        mocks.queryRemoteOutcome.mockImplementationOnce(async () => {
            isConnected.value = false;
            return { ok: true, docs: [] };
        });
        expect(await appDeps().deps.queryTranslations("post-1")).toBeUndefined();
    });
});

describe("getLocalTranslations", () => {
    it("lists the parent's stored content docs only", async () => {
        await db.docs.bulkPut([
            makeContent(),
            makeContent({ _id: "content-2", language: "lang-fra" }),
            makeContent({ _id: "content-3", parentId: "post-2" }),
            { _id: "redirect-1", type: DocType.Redirect, updatedTimeUtc: 1, parentId: "post-1" },
        ]);
        const docs = await appDeps().deps.getLocalTranslations("post-1");
        expect(docs.map((d) => d._id).sort()).toEqual(["content-1", "content-2"]);
    });
});

describe("resolveSource", () => {
    it("has nothing for a YouTube link or content without a master", async () => {
        const { deps } = appDeps();
        expect(
            await deps.resolveSource(
                makeContent({
                    parentMedia: { hlsUrl: "https://www.youtube.com/watch?v=abcdefghijk" },
                }),
            ),
        ).toBeUndefined();
        expect(await deps.resolveSource(makeContent({ parentMedia: {} }))).toBeUndefined();
    });

    it("names the side files beside the master and fetches the key for encrypted media", async () => {
        mocks.fetchHlsKeyOutcome.mockResolvedValue({ outcome: "key", keyHex: "cd".repeat(16) });
        const source = await appDeps().deps.resolveSource(
            makeContent({
                parentMedia: {
                    hlsUrl: "https://cdn.example.org/post-1/master.m3u8?v=2",
                    hlsKey_id: "key-1",
                },
            }),
        );
        expect(mocks.fetchHlsKeyOutcome).toHaveBeenCalledWith("post-1");
        expect(source).toEqual({
            masterUrl: "https://cdn.example.org/post-1/master.m3u8?v=2",
            keyHex: "cd".repeat(16),
            chaptersUrl: "https://cdn.example.org/post-1/chapters/en.vtt",
            thumbnailsUrl: "https://cdn.example.org/post-1/thumbnails/thumbnails.vtt",
            artworkUrls: [],
        });
    });

    it("fails when the key cannot be had", async () => {
        mocks.fetchHlsKeyOutcome.mockResolvedValue({ outcome: "denied" });
        await expect(
            appDeps().deps.resolveSource(
                makeContent({
                    parentMedia: { hlsUrl: "https://cdn.example.org/m.m3u8", hlsKey_id: "k" },
                }),
            ),
        ).rejects.toThrow("denied");
    });
});

describe("watchDocs", () => {
    it("reports a parent when its content or parent doc is written, not when one leaves", async () => {
        await db.docs.bulkPut([makeContent(), makeParent()]);
        const listener = vi.fn();
        const stop = appDeps().deps.watchDocs(() => ["post-1"], listener);
        try {
            // The first answer is the starting point, not a change.
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(listener).not.toHaveBeenCalled();

            await db.docs.put(makeContent({ updatedTimeUtc: 2 }));
            await waitForExpect(() => expect(listener).toHaveBeenCalledWith(["post-1"]));
            listener.mockClear();

            await db.docs.put({ ...makeParent(), updatedTimeUtc: 2 });
            await waitForExpect(() => expect(listener).toHaveBeenCalledWith(["post-1"]));
            listener.mockClear();

            await db.docs.delete("content-1");
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(listener).not.toHaveBeenCalled();
        } finally {
            stop();
        }
    });
});

describe("translator", () => {
    it("is missing until i18n is installed, then passes parameters through", () => {
        const { app, deps } = appDeps();
        expect(deps.translator()).toBeUndefined();
        const t = vi.fn(
            (key: string, params: Record<string, unknown>) => `${key}:${JSON.stringify(params)}`,
        );
        (app.config.globalProperties as unknown as { $t: typeof t }).$t = t;
        expect(deps.translator()?.t("downloads.metered.message", { size: "5 MB" })).toBe(
            'downloads.metered.message:{"size":"5 MB"}',
        );
        expect(deps.translator()?.t("downloads.title")).toBe("downloads.title:{}");
    });
});
