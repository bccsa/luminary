import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, reactive, ref } from "vue";
import MediaPlayerWrapper from "@/media-player/MediaPlayerWrapper.vue";
import { playOnlineOverride } from "@/media-player/mediaPlayer";
import { actOnPlayerNotice, playerNotice } from "@/media-player/playerNotice";
import { syncContentProgressFromStorage } from "@/contentProgress";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";
import { createFakeEngine, type FakeEngine } from "../fakeEngine";
import { MORE_READY_FOLD_MS } from "../player";
import { createDownloadsService, type DownloadsRuntime } from "../service";
import { GROUP, makeDeps, makeParent } from "./helpers";

/**
 * The download sheet's switch against the player page itself: when the page moves to the stream on its own after the
 * viewer picked the download, the switch names the stream, whatever the pick said.
 */
const handle = vi.hoisted(() => ({ state: null as any, held: null as any }));

vi.mock("@/util/fallbackArtwork", () => ({
    fallbackArtworkDataUrl: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@luminary-media-converter/player-web", () => ({
    AUDIO_ONLY_ANGLE_ID: "__audio__",
    isYouTubeUrl: () => false,
    findPreferredTrack: () => undefined,
    LuminaryPlayer: { name: "LuminaryPlayer", render: () => null },
}));
vi.mock("@/media-player/player", () => import("@luminary-media-converter/player-web"));
vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({ bucketBaseUrl: computed(() => "https://bucket.example.com") }),
}));
vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    fetchHlsKey: vi.fn(() => Promise.resolve("online-key")),
}));
vi.mock("@/recommendation/affinityStore", () => ({ recordAffinity: vi.fn() }));
vi.mock("@/recommendation/defaultAffinityStore", () => ({
    affinityConfig: computed(() => ({
        eventWeight: { completion: 5 },
        mediaCompletionPercent: 90,
    })),
}));
vi.mock("@/userActivity/store", () => ({ ensureUserActivity: vi.fn() }));

/** The native player as far as the page sees it: its props, its events, and a handle with reactive state. */
const NativeStub = {
    name: "NativeStub",
    props: {
        source: { type: Object, required: true },
        preferredLanguage: String,
        controls: Object,
        messages: Object,
        controllerOptions: Object,
        nowPlaying: Object,
        upNext: Array,
        nextUp: Array,
        chapters: { type: Array, default: undefined },
        lazyThumbnails: Boolean,
    },
    emits: ["loadedmetadata", "timeupdate", "ended", "downloadaction"],
    setup(_props: unknown, { expose }: { expose: (exposed: object) => void }) {
        const state = reactive({
            lifecycle: "ready",
            error: null,
            playing: false,
            currentTime: 0,
            duration: 0,
            isAudioOnly: false,
            activeAngleId: "angle_0",
            audioTracks: [{ id: "a-en", lang: "en", label: "English" }],
            activeAudioTrackId: "a-en",
        });
        const held = ref(false);
        handle.state = state;
        handle.held = held;
        expose({
            controller: { canCapInPlace: true, setMaxHeight: vi.fn() },
            state,
            get castHeldLocal() {
                return held.value;
            },
            airPlayActive: false,
            playingHeight: 720,
            play: vi.fn(() => Promise.resolve(true)),
            pause: vi.fn(),
            seek: vi.fn(),
            enterFullscreen: vi.fn(() => Promise.resolve()),
            exitFullscreen: vi.fn(() => Promise.resolve()),
        });
        return () => null;
    },
};

const DOWNLOAD = "luminary://offline/fake/master.m3u8";
const parentId = mockEnglishContentDto.parentId;
const content = () =>
    ({
        ...mockEnglishContentDto,
        parentMediaBucketId: "bucket-1",
        parentMedia: { hlsUrl: "/media/abc/master.m3u8", hlsKey_id: "key-1" },
        video: undefined,
    }) as any;

const native = (wrapper: any) => wrapper.findComponent({ name: "NativeStub" });
const sourceUrl = (wrapper: any): string => native(wrapper).props("source").masterUrl;

async function loadedAt(wrapper: any, local: number) {
    native(wrapper).vm.$emit("loadedmetadata");
    handle.state.currentTime = local;
    native(wrapper).vm.$emit("timeupdate", local, 1800);
    await flushPromises();
}

let services: DownloadsRuntime[] = [];
beforeEach(() => {
    localStorage.clear();
    syncContentProgressFromStorage();
    playOnlineOverride.value = null;
    playerNotice.value = null;
});
afterEach(() => {
    services.forEach((service) => service.dispose());
    services = [];
});

/**
 * The app's downloads service over the fake engine, holding a playable download of the item, which streams paused.
 * `ticks`: the transfer steps done, the item and then one chapter each; all three chapters by default.
 */
async function streaming(ticks = 4) {
    const fake = createFakeEngine();
    await fake.start({
        downloadId: "d1",
        parentId,
        parentType: "post",
        source: { masterUrl: DOWNLOAD, artworkUrls: [] },
        selection: { kind: "audio", audioLanguage: "en" },
        chapterIndices: [0, 1, 2],
        content: {
            title: "Item",
            contentId: mockEnglishContentDto._id,
            language: "lang-eng",
            memberOf: [GROUP],
            durationSeconds: 0,
        },
        texts: { title: "Item" },
        volumeId: "internal",
        meteredConsent: false,
        expiresAt: null,
    });
    for (let i = 0; i < ticks; i++) fake.tick();
    const helpers = makeDeps();
    helpers.docs.set(parentId, makeParent(parentId));
    const service = createDownloadsService(fake, helpers.deps);
    services.push(service);
    await service.whenReady;

    // The viewer chose Online in the player, so the item streams.
    playOnlineOverride.value = true;
    const wrapper = mount(MediaPlayerWrapper, {
        props: { content: content(), language: "en" },
        global: {
            stubs: { LImage: true },
            provide: {
                [VideoPlayerKey as symbol]: {
                    component: NativeStub,
                    acceptsNowPlaying: true,
                    playsDownloads: true,
                },
                [DownloadsKey as symbol]: service,
            },
        },
    });
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await flushPromises();
    await loadedAt(wrapper, 100);
    expect(sourceUrl(wrapper)).toContain("https://");
    return { fake, service, wrapper };
}

/** {@link streaming}, then the viewer picks Downloaded on the sheet and the download plays. */
async function pickedDownload() {
    const { fake, service, wrapper } = await streaming();
    await service.openSheet(content(), { context: "player" });
    fake.act({ action: "source", value: "downloaded" });
    await flushPromises();
    expect(sourceUrl(wrapper)).toBe(DOWNLOAD);
    expect(switchNames(fake)).toBe("downloaded");
    await loadedAt(wrapper, 10);
    return { fake, service, wrapper, playbackId: [...fake.sessions.keys()][0] };
}

const switchNames = (fake: FakeEngine) => fake.sheet.value?.model.source?.current;

/** The player loads the stream it was given and lets the download's session go; the engine reports it. */
async function streamLoads(wrapper: any, fake: FakeEngine, playbackId: string) {
    expect(sourceUrl(wrapper)).toContain("https://");
    fake.closeSession(playbackId);
    await flushPromises();
}

async function reopened(fake: FakeEngine, service: DownloadsRuntime) {
    await service.openSheet(content(), { context: "player" });
    await flushPromises();
    expect(service.player.sourceOverride(parentId)).toBe("downloaded");
    return switchNames(fake);
}

describe("the download sheet's switch when the player moves to the stream by itself", () => {
    it("names Online after the download picked fails to load and the stream takes over", async () => {
        const { fake, service, wrapper, playbackId } = await pickedDownload();

        handle.state.lifecycle = "error";
        await flushPromises();
        await streamLoads(wrapper, fake, playbackId);

        expect(await reopened(fake, service)).toBe("online");
    });

    it("names Online after a chapter the download lacks is played online", async () => {
        const { fake, service, wrapper, playbackId } = await pickedDownload();

        native(wrapper).vm.$emit("downloadaction", { action: "chapterOnline", value: "1" });
        await flushPromises();
        await streamLoads(wrapper, fake, playbackId);

        expect(await reopened(fake, service)).toBe("online");
    });

    it("names Online after the engine closed the session and the viewer chose Play online", async () => {
        const { fake, service, wrapper, playbackId } = await pickedDownload();

        fake.closeSession(playbackId, "volume-unavailable");
        await flushPromises();
        actOnPlayerNotice(playerNotice.value!.id);
        await flushPromises();
        expect(sourceUrl(wrapper)).toContain("https://");

        expect(await reopened(fake, service)).toBe("online");
    });

    it("names Online after a cast device chosen while the download plays takes the stream", async () => {
        const { fake, service, wrapper, playbackId } = await pickedDownload();

        handle.held.value = true;
        await flushPromises();
        await streamLoads(wrapper, fake, playbackId);

        expect(await reopened(fake, service)).toBe("online");
    });
});

/**
 * Holds the next `openPlayback` until released. `readFirst`: the engine reads the download before the hold, so what
 * finishes during it is not in the session.
 */
function holdOpen(fake: FakeEngine, readFirst = false) {
    const openPlayback = fake.openPlayback.bind(fake);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const spy = vi.spyOn(fake, "openPlayback").mockImplementationOnce(async (downloadId) => {
        const read = readFirst ? openPlayback(downloadId) : undefined;
        await gate;
        return read ?? openPlayback(downloadId);
    });
    return { spy, release: () => release() };
}

/** Lets the held open go, and what it starts settle. */
async function released(release: () => void) {
    release();
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(0);
}

describe("the download sheet's pick while more of the download becomes ready", () => {
    it("follows a Downloaded pick from a paused stream with one session, though more became ready as it opened", async () => {
        const { fake, service, wrapper } = await streaming(3);
        expect(handle.state.playing).toBe(false);
        await service.openSheet(content(), { context: "player" });
        const { spy: opens, release } = holdOpen(fake);
        const choose = vi.spyOn(service.player, "chooseSource");
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            fake.act({ action: "source", value: "downloaded" });
            await vi.advanceTimersByTimeAsync(0);
            fake.tick();
            await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
            await released(release);
            await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
        } finally {
            vi.useRealTimers();
        }

        expect(await choose.mock.results[0].value).toBe(true);
        expect(fake.sheet.value?.model.phase).not.toBe("error");
        expect(fake.sheet.value?.model.message).toBeUndefined();
        expect(opens).toHaveBeenCalledTimes(1);
        expect(fake.sessions.size).toBe(1);
        expect(sourceUrl(wrapper)).toBe(DOWNLOAD);
        expect(switchNames(fake)).toBe("downloaded");
    });

    it("opens nothing more once the pick loads a session holding what finished as it opened", async () => {
        const { fake, service, wrapper } = await streaming(3);
        await service.openSheet(content(), { context: "player" });
        const { spy: opens, release } = holdOpen(fake);
        const choose = vi.spyOn(service.player, "chooseSource");
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            fake.act({ action: "source", value: "downloaded" });
            await vi.advanceTimersByTimeAsync(0);
            fake.tick();
            // The open settles before what finished is folded into one report.
            await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS / 2);
            await released(release);
            await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS);
            await flushPromises();
        } finally {
            vi.useRealTimers();
        }

        expect(await choose.mock.results[0].value).toBe(true);
        expect(opens).toHaveBeenCalledTimes(1);
        expect(fake.sessions.size).toBe(1);
        expect(sourceUrl(wrapper)).toBe(DOWNLOAD);
    });

    it("switches once the pick loads a session that lacks what finished as it opened", async () => {
        const { fake, service, wrapper } = await streaming(3);
        await service.openSheet(content(), { context: "player" });
        const { spy: opens, release } = holdOpen(fake, true);
        const choose = vi.spyOn(service.player, "chooseSource");
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            fake.act({ action: "source", value: "downloaded" });
            await vi.advanceTimersByTimeAsync(0);
            fake.tick();
            await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
            await released(release);
            expect(await choose.mock.results[0].value).toBe(true);
            expect(opens).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(MORE_READY_FOLD_MS + 1);
            await flushPromises();
        } finally {
            vi.useRealTimers();
        }

        expect(opens).toHaveBeenCalledTimes(2);
        const [picked, holding] = [...fake.sessions.keys()];
        expect(holding).toBeDefined();
        expect(service.player.playing.value?.playbackId).toBe(holding);
        expect(picked).not.toBe(holding);
        expect(sourceUrl(wrapper)).toBe(DOWNLOAD);
    });
});
