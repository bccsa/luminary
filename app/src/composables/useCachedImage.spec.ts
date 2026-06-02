import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { IMAGE_CACHE_NAME, useCachedImage } from "./useCachedImage";

// Flush pending microtasks/timers so the composable's async resolve() can settle.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const makeResponse = (ok = true) => ({
    ok,
    clone() {
        return this;
    },
    blob: vi.fn().mockResolvedValue(new Blob(["image-bytes"])),
});

describe("useCachedImage", () => {
    const matchMock = vi.fn();
    const putMock = vi.fn();
    const openMock = vi.fn();
    const fetchMock = vi.fn();

    const originals = {
        caches: globalThis.caches,
        fetch: globalThis.fetch,
        createObjectURL: globalThis.URL.createObjectURL,
        revokeObjectURL: globalThis.URL.revokeObjectURL,
    };

    let urlCounter = 0;

    beforeEach(() => {
        matchMock.mockReset();
        putMock.mockReset();
        openMock.mockReset().mockResolvedValue({ match: matchMock, put: putMock });
        fetchMock.mockReset();
        urlCounter = 0;

        globalThis.caches = { open: openMock } as unknown as CacheStorage;
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        globalThis.URL.createObjectURL = vi.fn(() => `blob:mock-${urlCounter++}`);
        globalThis.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        globalThis.caches = originals.caches;
        globalThis.fetch = originals.fetch;
        globalThis.URL.createObjectURL = originals.createObjectURL;
        globalThis.URL.revokeObjectURL = originals.revokeObjectURL;
    });

    it("serves a cached image without hitting the network", async () => {
        matchMock.mockResolvedValue(makeResponse());

        const scope = effectScope();
        const result = scope.run(() => useCachedImage(ref("https://cdn.example.com/a.webp")))!;
        await flush();

        expect(openMock).toHaveBeenCalledWith(IMAGE_CACHE_NAME);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(putMock).not.toHaveBeenCalled();
        expect(result.objectUrl.value).toMatch(/^blob:/);
        expect(result.error.value).toBe(false);

        scope.stop();
    });

    it("fetches, caches and exposes an object URL on a cache miss", async () => {
        matchMock.mockResolvedValue(undefined);
        fetchMock.mockResolvedValue(makeResponse(true));

        const scope = effectScope();
        const result = scope.run(() => useCachedImage(ref("https://cdn.example.com/b.webp")))!;
        await flush();

        expect(fetchMock).toHaveBeenCalledWith("https://cdn.example.com/b.webp", { mode: "cors" });
        expect(putMock).toHaveBeenCalledTimes(1);
        expect(result.objectUrl.value).toMatch(/^blob:/);
        expect(result.error.value).toBe(false);

        scope.stop();
    });

    it("sets error and no object URL when offline and uncached", async () => {
        matchMock.mockResolvedValue(undefined);
        fetchMock.mockRejectedValue(new Error("offline"));

        const scope = effectScope();
        const result = scope.run(() => useCachedImage(ref("https://cdn.example.com/c.webp")))!;
        await flush();

        expect(result.objectUrl.value).toBeUndefined();
        expect(result.error.value).toBe(true);

        scope.stop();
    });

    it("treats a non-ok response as a failure and does not cache it", async () => {
        matchMock.mockResolvedValue(undefined);
        fetchMock.mockResolvedValue(makeResponse(false));

        const scope = effectScope();
        const result = scope.run(() => useCachedImage(ref("https://cdn.example.com/d.webp")))!;
        await flush();

        expect(putMock).not.toHaveBeenCalled();
        expect(result.error.value).toBe(true);
        expect(result.objectUrl.value).toBeUndefined();

        scope.stop();
    });

    it("falls back to the raw URL when the Cache API is unavailable", async () => {
        globalThis.caches = undefined as unknown as CacheStorage;

        const scope = effectScope();
        const result = scope.run(() => useCachedImage(ref("https://cdn.example.com/e.webp")))!;
        await flush();

        expect(result.objectUrl.value).toBe("https://cdn.example.com/e.webp");
        expect(result.error.value).toBe(false);

        scope.stop();
    });

    it("revokes the previous object URL when the source changes", async () => {
        matchMock.mockResolvedValue(makeResponse());

        const source = ref("https://cdn.example.com/first.webp");
        const scope = effectScope();
        const result = scope.run(() => useCachedImage(source))!;
        await flush();

        const first = result.objectUrl.value;
        expect(first).toMatch(/^blob:/);

        source.value = "https://cdn.example.com/second.webp";
        await flush();

        expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(first);
        expect(result.objectUrl.value).not.toBe(first);

        scope.stop();
    });
});
