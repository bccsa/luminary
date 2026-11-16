import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, nextTick, type Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import {
    canProbeLive,
    isLivePlaylist,
    probeLiveStream,
    resetLiveStreamCache,
    useLiveStream,
} from "./useLiveStream";

const LIVE_MEDIA =
    "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:120\n#EXTINF:6,\nseg120.ts\n";
const VOD_MEDIA =
    "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST\n";
const MASTER =
    "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000\nhigh/index.m3u8\n";

function respond(body: string, ok = true) {
    return Promise.resolve({ ok, text: () => Promise.resolve(body) } as Response);
}

describe("isLivePlaylist", () => {
    it("is live without an end tag", () => {
        expect(isLivePlaylist(LIVE_MEDIA)).toBe(true);
    });

    it("is not live with an end tag or a VOD playlist type", () => {
        expect(isLivePlaylist(VOD_MEDIA)).toBe(false);
        expect(
            isLivePlaylist(LIVE_MEDIA.replace("#EXTM3U\n", "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n")),
        ).toBe(false);
    });
});

describe("canProbeLive", () => {
    it("only probes streams hosted outside the app's own buckets", () => {
        expect(canProbeLive("https://cdn.example.com/live/master.m3u8")).toBe(true);
        expect(canProbeLive("/media/abc/master.m3u8")).toBe(false);
        expect(canProbeLive("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
        expect(canProbeLive(undefined)).toBe(false);
    });
});

describe("probeLiveStream", () => {
    beforeEach(() => resetLiveStreamCache());

    it("follows a master playlist to its first variant", async () => {
        const fetchFn = vi.fn((url: string) =>
            url.endsWith("master.m3u8") ? respond(MASTER) : respond(LIVE_MEDIA),
        );
        expect(await probeLiveStream("https://cdn.example.com/live/master.m3u8", fetchFn)).toBe(
            "live",
        );
        expect(fetchFn).toHaveBeenLastCalledWith(
            "https://cdn.example.com/live/low/index.m3u8",
            expect.anything(),
        );
    });

    it("reports a finished recording as a recording", async () => {
        const fetchFn = vi.fn(() => respond(VOD_MEDIA));
        expect(await probeLiveStream("https://cdn.example.com/vod/index.m3u8", fetchFn)).toBe(
            "recording",
        );
    });

    it("reports an unreachable stream as offline", async () => {
        const fetchFn = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
        expect(await probeLiveStream("https://cdn.example.com/live/master.m3u8", fetchFn)).toBe(
            "offline",
        );
        const notFound = vi.fn(() => respond("", false));
        expect(await probeLiveStream("https://cdn.example.com/other.m3u8", notFound)).toBe(
            "offline",
        );
    });
});

describe("useLiveStream", () => {
    beforeEach(() => {
        resetLiveStreamCache();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    function mountWith(src: () => string | undefined) {
        let isLive: Ref<boolean> | undefined;
        const wrapper = mount(
            defineComponent({
                setup() {
                    isLive = useLiveStream(src);
                    return () => h("div");
                },
            }),
        );
        return { wrapper, isLive: () => isLive?.value };
    }

    it("turns on while the stream is live and off once it ends", async () => {
        let body = LIVE_MEDIA;
        vi.stubGlobal(
            "fetch",
            vi.fn(() => respond(body)),
        );
        const { isLive } = mountWith(() => "https://cdn.example.com/live/index.m3u8");
        await flushPromises();
        expect(isLive()).toBe(true);

        body = "";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => respond("", false)),
        );
        await vi.advanceTimersByTimeAsync(61_000);
        await flushPromises();
        expect(isLive()).toBe(false);
    });

    it("never fetches the app's own media", async () => {
        const fetchFn = vi.fn(() => respond(LIVE_MEDIA));
        vi.stubGlobal("fetch", fetchFn);
        const { isLive } = mountWith(() => "/media/abc/master.m3u8");
        await flushPromises();
        await nextTick();
        expect(isLive()).toBe(false);
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("does not ask again about a recording", async () => {
        const fetchFn = vi.fn(() => respond(VOD_MEDIA));
        vi.stubGlobal("fetch", fetchFn);
        mountWith(() => "https://cdn.example.com/vod/index.m3u8");
        await flushPromises();
        await vi.advanceTimersByTimeAsync(5 * 61_000);
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });
});
