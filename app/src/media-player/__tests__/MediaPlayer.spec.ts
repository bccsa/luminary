import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { isDarkTheme, userDataSaverEnabled } from "@/globalConfig";
import { isPlayerSwap, clearSwaps } from "@/util/playerSwap";
import { markSeen } from "@/recommendation/seenStore";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
import MediaPlayer from "../MediaPlayer.vue";
import { PlatformChromeKey } from "@/build-time/contracts/platform-chrome/token";
import {
    closeMediaPlayer,
    mediaPlayerItem,
    minimiseMediaPlayer,
    mediaPlayerView,
    openMediaPlayer,
} from "../mediaPlayer";

const AUDIO = "__audio__";

/** The engine `VideoPlayer` hands the media player: a controller, its state, and the handle. */
const engine = vi.hoisted(() => ({
    state: null as any,
    controller: null as any,
    handle: null as any,
    props: null as any,
    emit: null as any,
    mounts: 0,
    inlineActive: false,
    canMute: false,
    airPlayAvailable: false,
    castAvailable: false,
    airPlayActive: false,
    thumbnailsReady: false,
}));

vi.mock("@luminary-media-converter/player-web", async () => {
    const { defineComponent, h } = await import("vue");
    return {
        AUDIO_ONLY_ANGLE_ID: "__audio__",
        // The strip itself is the player's; what matters here is when the media player shows it.
        ScrubRoster: defineComponent({
            name: "ScrubRoster",
            props: { tiles: Array, markerX: Number, interactive: Boolean, closeLabel: String },
            emits: ["close"],
            setup:
                (props, { emit }) =>
                () =>
                    h("div", { "data-test": "scrubRoster", "data-tiles": props.tiles?.length }, [
                        props.interactive
                            ? h("button", {
                                  "data-test": "mediaPlayerRosterClose",
                                  onClick: () => emit("close"),
                              })
                            : null,
                    ]),
        }),
        // The real one is player-core's, tested there: the last chapter that has started.
        chapterIndexAt: (chapters: { startTime: number }[], time: number) =>
            chapters.reduce(
                (found, chapter, index) => (chapter.startTime <= time ? index : found),
                -1,
            ),
        chapterSegments: () => [],
        chapterMask: () => "",
        mergeMessages: (messages: object) => messages,
        // The real screen is the player's, tested there: it says what is asked through its events.
        AudioFullscreen: defineComponent({
            name: "AudioFullscreen",
            props: {
                title: String,
                subtitle: String,
                artwork: Object,
                playing: Boolean,
                busy: Boolean,
                live: Boolean,
                currentTime: Number,
                hasBrowse: Boolean,
                chaptersSheet: Boolean,
                appearance: String,
                stage: String,
                stageHole: Boolean,
                wash: String,
                exitLabel: String,
                subtitleTracks: Array,
                activeSubtitleTrackId: String,
                canPictureInPicture: Boolean,
                lyrics: Array,
            },
            emits: [
                "exit",
                "toggle-play",
                "seek",
                "sleep",
                "rate",
                "seek-chapter",
                "upnextselect",
                "subtitle-track",
                "picture-in-picture",
                "fullscreen",
            ],
            // Its top line and its stage, as the real screen draws them, so a host's switch and engine live in it.
            setup: (props, { slots }) => () =>
                h("div", { "data-test": "audioFullscreenStub" }, [
                    h("div", { class: "lmpl-afs-top", "data-test": "audioFullscreenTop" }, [
                        slots["top-end"]?.(),
                    ]),
                    props.title,
                    slots.sheet?.({ close: () => {} }),
                    slots.cast?.(),
                    h("div", { "data-test": "audioFullscreenStage" }, [slots.stage?.()]),
                ]),
        }),
        rosterStep: () => 4,
        rosterFineStep: () => 1,
        rosterTiles: (time: number) => [{ index: 0, left: 0, time }],
    };
});

vi.mock("@/util/fallbackArtwork", () => ({
    fallbackImageFor: () => "/stand-in.jpg",
    fallbackArtworkDataUrl: () => Promise.resolve(undefined),
}));

const upNextDocs = vi.hoisted(() => ({ value: [] as any[] }));
const categoryDocs = vi.hoisted(() => ({ value: [] as any[] }));
const tagDocs = vi.hoisted(() => ({ value: [] as any[] }));
vi.mock("@/composables/useContentQuery", async () => {
    const { computed } = await import("vue");
    return {
        // Two queries ask for tag documents: the categories (a series) and all of the tags.
        useContentQuery: (selector: () => unknown[]) =>
            computed(() => {
                const text = JSON.stringify(selector());
                if (!text.includes('"parentType"')) return upNextDocs.value;
                return text.includes('"parentTagType"') ? categoryDocs.value : tagDocs.value;
            }),
    };
});

const routerPush = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    useRouter: () => ({
        push: routerPush,
        resolve: (to: { params: { slug: string } }) => ({ fullPath: `/${to.params.slug}` }),
    }),
}));

vi.mock("@/components/content/VideoPlayer.vue", async () => {
    const { defineComponent, h, reactive } = await import("vue");
    return {
        default: defineComponent({
            name: "VideoPlayer",
            props: {
                content: Object,
                language: String,
                startAudio: Boolean,
                autoplay: Boolean,
                fullscreenOnPlay: Boolean,
                inline: Boolean,
                captionBand: Number,
                upNext: Array,
                nextUp: Array,
            },
            emits: ["upnextselect", "nextupselect"],
            setup(props, { expose, emit }) {
                engine.emit = emit;
                engine.mounts++;
                engine.props = props;
                engine.state = reactive({
                    lifecycle: "ready",
                    playing: true,
                    currentTime: 30,
                    duration: 120,
                    bufferedEnd: 60,
                    playbackRate: 1,
                    isAudioOnly: false,
                    live: false,
                    activeAngleId: "angle_0",
                    angles: [
                        { id: "angle_0", name: "Wide", isDefault: true },
                        { id: AUDIO, name: "Audio only", isDefault: false },
                    ],
                    audioTracks: [
                        { id: "en", lang: "en", label: "English" },
                        { id: "fr", lang: "fr", label: "Français" },
                    ],
                    activeAudioTrackId: "en",
                    muted: false,
                    volume: 0.5,
                    chapters: [] as { startTime: number; endTime: number; title: string }[],
                    subtitleTracks: [
                        { id: "sub-fr", lang: "fr", label: "Français", source: "master" },
                    ],
                    activeSubtitleTrackId: null,
                    sleepTimer: null,
                    thumbnailsReady: engine.thumbnailsReady,
                });
                engine.controller = {
                    thumbnailAt: vi.fn(() =>
                        engine.thumbnailsReady
                            ? { spriteUrl: "blob:sprite", x: 0, y: 0, w: 160, h: 90 }
                            : null,
                    ),
                    setAngle: vi.fn(async (id: string) => {
                        engine.state.activeAngleId = id;
                        engine.state.isAudioOnly = id === AUDIO;
                    }),
                    setPlaybackRate: vi.fn(),
                    setSleepTimer: vi.fn(),
                    seek: vi.fn(),
                    setAudioTrack: vi.fn(),
                    setSubtitleTrack: vi.fn(),
                };
                engine.handle = {
                    controller: engine.controller,
                    state: engine.state,
                    play: vi.fn(),
                    pause: vi.fn(),
                    seek: vi.fn(),
                    enterFullscreen: vi.fn(),
                    exitFullscreen: vi.fn(),
                    canMute: engine.canMute,
                    canPictureInPicture: engine.canMute,
                    get muted() {
                        return engine.state.muted;
                    },
                    setMuted: vi.fn(),
                    get volume() {
                        return engine.state.volume;
                    },
                    setVolume: vi.fn(),
                    startPictureInPicture: vi.fn(),
                    get airPlayAvailable() {
                        return engine.airPlayAvailable;
                    },
                    get castAvailable() {
                        return engine.castAvailable;
                    },
                    showCastPicker: vi.fn(),
                    get airPlayActive() {
                        return engine.airPlayActive;
                    },
                    showAirPlayPicker: vi.fn(),
                };
                expose({
                    player: engine.handle,
                    get inlineActive() {
                        return engine.inlineActive;
                    },
                });
                return () => h("div", { class: "video-player-stub" });
            },
        }),
    };
});

const wrappers: VueWrapper[] = [];

async function mountPlayer(provide: Record<symbol, unknown> = {}) {
    const wrapper = mount(MediaPlayer, { global: { stubs: { LImage: true }, provide } });
    wrappers.push(wrapper);
    await flushPromises();
    return wrapper;
}

async function playing() {
    openMediaPlayer(mockEnglishContentDto, "en");
    return mountPlayer();
}

/**
 * The width the spec runs at: the card layout these tests describe is the wide screen's, so that is the default; a
 * phone, where the now-playing screen takes its place, is asked for with `narrow`.
 */
let screenWide = true;
const setupMatchMedia = window.matchMedia;
beforeEach(() => {
    screenWide = true;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("1024px") ? screenWide : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
    window.matchMedia = setupMatchMedia;
});

/** A phone for the length of `run`: the media query for 1024 px and up does not match. */
async function narrow(run: () => Promise<void>) {
    screenWide = false;
    try {
        await run();
    } finally {
        screenWide = true;
    }
}

/** A wide screen for the length of `run`: the media query for 1024 px and up matches. */
async function wide(run: () => Promise<void>) {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("1024px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
        await run();
    } finally {
        window.matchMedia = original;
    }
}

const find = (wrapper: VueWrapper, test: string) => wrapper.find(`[data-test='${test}']`);

beforeEach(() => {
    setActivePinia(createPinia());
    upNextDocs.value = [];
    categoryDocs.value = [];
    tagDocs.value = [];
    routerPush.mockClear();
    engine.mounts = 0;
    engine.inlineActive = false;
    engine.canMute = false;
    engine.airPlayAvailable = false;
    engine.airPlayActive = false;
    engine.thumbnailsReady = false;
    document.documentElement.classList.remove("lmc-inline-video");
    document.documentElement.classList.remove("lmc-player-dragging");
    closeMediaPlayer();
    userDataSaverEnabled.value = false;
});

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

describe("MediaPlayer", () => {
    it("shows nothing while nothing plays", async () => {
        const wrapper = await mountPlayer();
        expect(find(wrapper, "mediaPlayer").exists()).toBe(false);
    });

    it("plays the content opened, starting on the video, autoplaying", async () => {
        const wrapper = await playing();

        expect(find(wrapper, "mediaPlayer").text()).toContain(mockEnglishContentDto.title);
        expect(engine.props.content._id).toBe(mockEnglishContentDto._id);
        expect(engine.props.startAudio).toBe(false);
        expect(engine.props.autoplay).toBe(true);
    });

    it("starts on the sound while Data Saver is on", async () => {
        userDataSaverEnabled.value = true;
        await playing();
        expect(engine.props.startAudio).toBe(true);
    });

    describe("the audio / video switch", () => {
        it("switches to the sound alone", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();

            expect(engine.controller.setAngle).toHaveBeenCalledWith(AUDIO);
            expect(find(wrapper, "mediaPlayerAudio").attributes("aria-pressed")).toBe("true");
        });

        it("washes the whole player with the cover's colour in the sound alone, pale in the light theme and dark in the dark one", async () => {
            for (const dark of [false, true]) {
                isDarkTheme.value = dark;
                const wrapper = await playing();
                expect(wrapper.find("[data-test='mediaPlayerWash']").exists()).toBe(false);

                await find(wrapper, "mediaPlayerAudio").trigger("click");
                await flushPromises();
                const wash = find(wrapper, "mediaPlayerWash");
                expect(wash.exists()).toBe(true);
                expect(wash.classes()).toContain("dark:bg-slate-900");
                expect(wash.html()).toContain("dark:bg-slate-900/65");
                wrapper.unmount();
            }
            isDarkTheme.value = false;
        });

        it("shows the cover in the sound alone at most 236px, two thirds wide and a quarter of the height", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerArtwork']").exists()).toBe(false);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();

            const artwork = find(wrapper, "mediaPlayerArtwork");
            expect(artwork.find("div").classes()).toContain("w-[min(66%,236px,26svh)]");
        });

        it("switches back to the camera that was playing", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();

            expect(engine.controller.setAngle).toHaveBeenLastCalledWith("angle_0");
        });

        it("is not offered when the source has no audio-only angle", async () => {
            const wrapper = await playing();
            engine.state.angles = [{ id: "angle_0", name: "Wide", isDefault: true }];
            await flushPromises();

            expect(find(wrapper, "mediaPlayerAudio").exists()).toBe(false);
        });
    });

    /** The sheet slides out before it is removed. */
    const slideAway = () => new Promise((resolve) => setTimeout(resolve, 260));

    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    describe("drawing the player down", () => {
        const pointer = (y: number) => ({ clientY: y, pointerId: 1 });
        const sectionStyle = (wrapper: VueWrapper) =>
            find(wrapper, "mediaPlayer").attributes("style") ?? "";

        it("follows the thumb down, with no easing of its own", async () => {
            const wrapper = await playing();
            const handle = find(wrapper, "mediaPlayerHandle");
            await handle.trigger("pointerdown", pointer(100));
            await handle.trigger("pointermove", pointer(150));

            expect(sectionStyle(wrapper)).toContain("--tw-translate-y: 50px");
            expect(sectionStyle(wrapper)).toContain("transition: none");
        });

        it("lets the page show through the strip it uncovers, and only while it is drawn", async () => {
            engine.inlineActive = true;
            const wrapper = await playing();
            const root = document.documentElement;
            const handle = find(wrapper, "mediaPlayerHandle");
            expect(root.classList.contains("lmc-player-dragging")).toBe(false);

            await handle.trigger("pointerdown", pointer(100));
            await handle.trigger("pointermove", pointer(160));
            expect(root.classList.contains("lmc-player-dragging")).toBe(true);
            // The strip is as tall as the pull, from the foot of the top bar.
            expect(root.style.getPropertyValue("--lmc-gap-bottom")).toBe(
                `${window.innerHeight - 0 - 60}px`,
            );

            await handle.trigger("pointerup");
            // Home already (nothing displaced it): the strip goes on the next frame.
            await nextFrame();
            expect(root.classList.contains("lmc-player-dragging")).toBe(false);
        });

        it("keeps the strip while the player springs back, and drops it when it is home", async () => {
            engine.inlineActive = true;
            let top = 60;
            const spy = vi
                .spyOn(Element.prototype, "getBoundingClientRect")
                .mockImplementation(function (this: Element) {
                    const y = this.getAttribute("role") === "dialog" ? top : 0;
                    return { top: y, bottom: y, left: 0, right: 0, width: 0, height: 0 } as DOMRect;
                });
            const wrapper = await playing();
            const root = document.documentElement;
            const handle = find(wrapper, "mediaPlayerHandle");
            await handle.trigger("pointerdown", pointer(100));
            await handle.trigger("pointermove", pointer(160));
            await handle.trigger("pointerup");

            // Let go, but still on its way back: 60 px from home, and the strip is as tall.
            await nextFrame();
            expect(root.classList.contains("lmc-player-dragging")).toBe(true);
            expect(root.style.getPropertyValue("--lmc-gap-bottom")).toBe(
                `${window.innerHeight - 60}px`,
            );

            top = 0;
            await nextFrame();
            await nextFrame();
            expect(root.classList.contains("lmc-player-dragging")).toBe(false);
            spy.mockRestore();
        });

        it("springs back when it is let go short of the way", async () => {
            const wrapper = await playing();
            const handle = find(wrapper, "mediaPlayerHandle");
            await handle.trigger("pointerdown", pointer(100));
            await handle.trigger("pointermove", pointer(150));
            await handle.trigger("pointerup");

            expect(sectionStyle(wrapper)).not.toContain("--tw-translate-y");
            expect(find(wrapper, "mediaPlayer").classes()).toContain("translate-y-0");
        });

        it("springs back from a pull of a hundred pixels: two fifths of its height is the way", async () => {
            const wrapper = await playing();
            const handle = find(wrapper, "mediaPlayerHandle");
            await handle.trigger("pointerdown", pointer(100));
            await handle.trigger("pointermove", pointer(200));
            await handle.trigger("pointerup");

            expect(find(wrapper, "mediaPlayer").classes()).toContain("translate-y-0");
            expect(find(wrapper, "mediaPlayer").classes()).not.toContain("translate-y-[110vh]");
        });

        it("slides into the bar when it is let go far enough down", async () => {
            screenWide = false;
            const wrapper = await playing();
            const handle = find(wrapper, "audioFullscreenTop");
            await handle.trigger("pointerdown", pointer(100));
            await handle.trigger("pointermove", pointer(450));
            await handle.trigger("pointerup");

            expect(sectionStyle(wrapper)).not.toContain("--tw-translate-y");
            expect(find(wrapper, "mediaPlayer").classes()).toContain("translate-y-[110vh]");
        });

        it("does not move on a pull up", async () => {
            const wrapper = await playing();
            const handle = find(wrapper, "mediaPlayerHandle");
            await handle.trigger("pointerdown", pointer(300));
            await handle.trigger("pointermove", pointer(200));
            expect(sectionStyle(wrapper)).not.toContain("--tw-translate-y");
        });

        it("is drawn down from the audio and video switch too, once the thumb has moved down", async () => {
            screenWide = false;
            const wrapper = await playing();
            const audio = find(wrapper, "mediaPlayerAudio");
            await audio.trigger("pointerdown", pointer(100));
            // Within a tap's slop the press is still the button's.
            await audio.trigger("pointermove", pointer(108));
            expect(sectionStyle(wrapper)).not.toContain("--tw-translate-y");

            await audio.trigger("pointermove", pointer(160));
            await audio.trigger("pointermove", pointer(500));
            await audio.trigger("pointerup");
            expect(find(wrapper, "mediaPlayer").classes()).toContain("translate-y-[110vh]");
        });

        it("leaves a tap on the switch to the switch", async () => {
            const wrapper = await playing();
            const audio = find(wrapper, "mediaPlayerAudio");
            await audio.trigger("pointerdown", pointer(100));
            await audio.trigger("pointerup");
            await audio.trigger("click");

            expect(engine.controller.setAngle).toHaveBeenCalledWith(AUDIO);
            expect(sectionStyle(wrapper)).not.toContain("--tw-translate-y");
            expect(find(wrapper, "mediaPlayer").classes()).not.toContain("translate-y-[110vh]");
        });
    });

    describe("the transport", () => {
        it("keeps the seek bar clear of the screen edges, where a system back gesture is read", async () => {
            const wrapper = await playing();
            // 2.5rem (40px) each side: wider than the zone Android and iOS give their edge gesture.
            expect(find(wrapper, "mediaPlayerSeekBar").classes()).toContain("px-10");
        });

        it("draws the skip buttons itself, not from an icon font the player may not ship", async () => {
            const wrapper = await playing();
            const buttons = wrapper.findAll("button[aria-label^='media_player.skip']");

            expect(buttons).toHaveLength(2);
            for (const button of buttons) {
                // Something is drawn: an inline vector, with a shape, and no font class to depend on.
                expect(button.find("svg path").attributes("d")?.length).toBeGreaterThan(20);
                expect(button.html()).not.toContain("vjs-icon");
                // The glyph says how far it skips.
                expect(button.find("svg text").text()).toMatch(/^\d+$/);
            }
            expect(buttons[0]!.find("svg path").attributes("d")).not.toBe(
                buttons[1]!.find("svg path").attributes("d"),
            );
        });

        it("pauses and plays", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerPlayPause").trigger("click");
            expect(engine.handle.pause).toHaveBeenCalled();

            engine.state.playing = false;
            await flushPromises();
            await find(wrapper, "mediaPlayerPlayPause").trigger("click");
            expect(engine.handle.play).toHaveBeenCalled();
        });

        it("skips by ten seconds either way", async () => {
            const wrapper = await playing();
            const buttons = wrapper.findAll("button[aria-label^='media_player.skip']");
            await buttons[0]!.trigger("click");
            await buttons[1]!.trigger("click");

            expect(engine.handle.seek).toHaveBeenNthCalledWith(1, 20);
            expect(engine.handle.seek).toHaveBeenNthCalledWith(2, 40);
        });

        describe("scrub frames", () => {
            beforeEach(() => {
                vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
                    width: 390,
                    height: 60,
                    left: 0,
                    top: 0,
                    right: 390,
                    bottom: 60,
                    x: 0,
                    y: 0,
                    toJSON: () => ({}),
                });
            });
            afterEach(() => {
                engine.thumbnailsReady = false;
            });

            it("shows the frames around the dot while it is dragged", async () => {
                engine.thumbnailsReady = true;
                const wrapper = await playing();
                expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(false);

                const bar = find(wrapper, "mediaPlayerSeek");
                (bar.element as HTMLInputElement).value = "90";
                await bar.trigger("input");

                expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(true);
                expect(wrapper.find("[data-test='scrubRoster']").exists()).toBe(true);
                expect(engine.controller.thumbnailAt).toHaveBeenCalledWith(90);
            });

            it("shows no frames while the sound alone plays, only the time", async () => {
                engine.thumbnailsReady = true;
                const wrapper = await playing();
                await engine.controller.setAngle("__audio__");
                await flushPromises();
                expect(find(wrapper, "mediaPlayerArtwork").exists()).toBe(true);

                const bar = find(wrapper, "mediaPlayerSeek");
                (bar.element as HTMLInputElement).value = "90";
                await bar.trigger("input");

                expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(false);
                expect(find(wrapper, "mediaPlayerScrubTime").text()).toBe("1:30");
            });

            it("takes pinned frames away when the sound alone is chosen", async () => {
                engine.thumbnailsReady = true;
                const wrapper = await playing();
                const bar = find(wrapper, "mediaPlayerSeek");
                (bar.element as HTMLInputElement).value = "90";
                await bar.trigger("input");
                await bar.trigger("change");
                expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(true);

                await engine.controller.setAngle("__audio__");
                await flushPromises();

                expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(false);
            });

            it("takes the frames away when the touch is taken from the bar before they showed", async () => {
                const wrapper = await playing();
                const bar = find(wrapper, "mediaPlayerSeek");
                (bar.element as HTMLInputElement).value = "90";
                await bar.trigger("input");
                await bar.trigger("pointercancel");

                expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(false);
            });

            describe("letting go", () => {
                async function heldAt90() {
                    engine.thumbnailsReady = true;
                    const wrapper = await playing();
                    const bar = find(wrapper, "mediaPlayerSeek");
                    (bar.element as HTMLInputElement).value = "90";
                    await bar.trigger("input");
                    return { wrapper, bar };
                }

                it("pauses the video while the frames are showing", async () => {
                    await heldAt90();

                    expect(engine.handle.pause).toHaveBeenCalled();
                });

                it("seeks and stays paused when the finger lifts, and keeps the frames up", async () => {
                    const { wrapper, bar } = await heldAt90();
                    engine.state.playing = false;
                    await flushPromises();
                    await bar.trigger("change");

                    expect(engine.handle.seek).toHaveBeenCalledWith(90);
                    expect(engine.handle.play).not.toHaveBeenCalled();
                    expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(true);
                });

                it("puts the frames away on a press outside the bar and the frames", async () => {
                    const { wrapper, bar } = await heldAt90();
                    await bar.trigger("change");

                    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
                    await flushPromises();

                    expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(false);
                });

                it("keeps the frames on a press on the bar or on the frames", async () => {
                    const { wrapper, bar } = await heldAt90();
                    await bar.trigger("change");

                    await bar.trigger("pointerdown");
                    await wrapper.find("[data-test='mediaPlayerRoster']").trigger("pointerdown");

                    expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(true);
                });

                async function pinnedRoster() {
                    const { wrapper, bar } = await heldAt90();
                    await bar.trigger("change");
                    engine.handle.seek.mockClear();
                    engine.handle.play.mockClear();
                    const roster = wrapper.find("[data-test='mediaPlayerRoster']");
                    vi.spyOn(roster.element, "getBoundingClientRect").mockReturnValue({
                        left: 0,
                        top: 0,
                        width: 390,
                        height: 60,
                        right: 390,
                        bottom: 60,
                        x: 0,
                        y: 0,
                        toJSON: () => ({}),
                    });
                    return { wrapper, roster };
                }
                const press = (x: number) => ({ clientX: x, pointerId: 1 });

                it("goes to the moment a tapped frame shows", async () => {
                    const { wrapper, roster } = await pinnedRoster();
                    const tiles = wrapper.findComponent({ name: "ScrubRoster" }).props("tiles") as {
                        left: number;
                        time: number;
                    }[];
                    const x = tiles[0]!.left + 1;
                    await roster.trigger("pointerdown", press(x));
                    await roster.trigger("pointerup", press(x));

                    expect(engine.handle.seek).toHaveBeenCalledTimes(1);
                    expect(engine.handle.seek.mock.calls[0]![0]).toBeLessThan(90);
                });

                it("moves through the video when the frames are dragged, and goes there on letting go", async () => {
                    const { roster } = await pinnedRoster();
                    await roster.trigger("pointerdown", press(200));
                    await roster.trigger("pointermove", press(100));
                    await roster.trigger("pointerup", press(100));

                    expect(engine.handle.seek).toHaveBeenCalledTimes(1);
                    expect(engine.handle.seek.mock.calls[0]![0]).toBeGreaterThan(90);
                });

                describe("dragging the picture", () => {
                    const picture = (wrapper: Awaited<ReturnType<typeof playing>>) =>
                        wrapper.find(".aspect-video");
                    const at = (x: number, y = 100) => ({ clientX: x, clientY: y, pointerId: 1 });

                    it("opens the frames on a sideways drag and goes where it ends", async () => {
                        engine.thumbnailsReady = true;
                        const wrapper = await playing();
                        const area = picture(wrapper);
                        await area.trigger("pointerdown", at(200));
                        await area.trigger("pointermove", at(150));
                        await area.trigger("pointermove", at(100));
                        await area.trigger("pointerup", at(100));

                        expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(true);
                        expect(engine.handle.seek).toHaveBeenCalledTimes(1);
                    });

                    it("leaves a tap or an up-and-down drag alone", async () => {
                        engine.thumbnailsReady = true;
                        const wrapper = await playing();
                        const area = picture(wrapper);
                        await area.trigger("pointerdown", at(200, 100));
                        await area.trigger("pointermove", at(205, 160));
                        await area.trigger("pointerup", at(205, 160));

                        expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(false);
                        expect(engine.handle.seek).not.toHaveBeenCalled();
                    });
                });

                it("stays paused after letting go when it was paused", async () => {
                    engine.thumbnailsReady = true;
                    const wrapper = await playing();
                    engine.state.playing = false;
                    await flushPromises();
                    const bar = find(wrapper, "mediaPlayerSeek");
                    (bar.element as HTMLInputElement).value = "90";
                    await bar.trigger("input");
                    await bar.trigger("change");

                    expect(engine.handle.seek).toHaveBeenCalledWith(90);
                    expect(engine.handle.play).not.toHaveBeenCalled();
                });

                it("stays paused when the browser cancels the pointer before reporting the change", async () => {
                    const { bar } = await heldAt90();
                    await bar.trigger("pointercancel");
                    await bar.trigger("change");

                    expect(engine.handle.seek).toHaveBeenCalled();
                    expect(engine.handle.play).not.toHaveBeenCalled();
                });

                it("keeps the frames up when the browser cancels the pointer, with or without a change after", async () => {
                    const { wrapper, bar } = await heldAt90();
                    await bar.trigger("pointercancel");
                    expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(true);

                    await bar.trigger("change");
                    expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(true);
                });
            });

            it("shows only the time for a video without scrub frames", async () => {
                const wrapper = await playing();
                const bar = find(wrapper, "mediaPlayerSeek");
                (bar.element as HTMLInputElement).value = "90";
                await bar.trigger("input");

                expect(wrapper.find("[data-test='mediaPlayerRoster']").exists()).toBe(false);
                expect(find(wrapper, "mediaPlayerScrubTime").text()).toBe("1:30");
            });
        });

        it("seeks where the bar is dropped", async () => {
            const wrapper = await playing();
            const bar = find(wrapper, "mediaPlayerSeek");
            (bar.element as HTMLInputElement).value = "90";
            await bar.trigger("change");

            expect(engine.handle.seek).toHaveBeenCalledWith(90);
        });

        it("gives the bar a touch target of 44 px", async () => {
            const wrapper = await playing();
            expect(find(wrapper, "mediaPlayerSeek").classes()).toContain("h-11");
        });

        it("shows the time at the dot while it is dragged, and not otherwise", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerScrubTime']").exists()).toBe(false);

            const bar = find(wrapper, "mediaPlayerSeek");
            (bar.element as HTMLInputElement).value = "90";
            await bar.trigger("input");
            expect(find(wrapper, "mediaPlayerScrubTime").text()).toBe("1:30");
            // Nothing is sought until the finger is up.
            expect(engine.handle.seek).not.toHaveBeenCalled();
        });

        it("keeps the dot where the finger put it while playback goes on", async () => {
            const wrapper = await playing();
            const bar = find(wrapper, "mediaPlayerSeek");
            (bar.element as HTMLInputElement).value = "90";
            await bar.trigger("input");

            engine.state.currentTime = 31;
            await flushPromises();
            expect((bar.element as HTMLInputElement).value).toBe("90");
            expect(wrapper.text()).toContain("1:30");
        });

        it("holds the dot at the target after it is let go, until playback arrives", async () => {
            const wrapper = await playing();
            const bar = find(wrapper, "mediaPlayerSeek");
            (bar.element as HTMLInputElement).value = "90";
            await bar.trigger("change");
            expect(engine.handle.seek).toHaveBeenCalledWith(90);

            // Playback has not got there yet: the dot does not fall back to where it was.
            await flushPromises();
            expect((bar.element as HTMLInputElement).value).toBe("90");

            engine.state.currentTime = 90.4;
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerScrubTime']").exists()).toBe(false);
            // Playback has the bar again.
            expect(Number((bar.element as HTMLInputElement).value)).toBeCloseTo(90.4, 1);
        });

        it("hands the bar back to playback when the drag is cancelled", async () => {
            const wrapper = await playing();
            const bar = find(wrapper, "mediaPlayerSeek");
            (bar.element as HTMLInputElement).value = "90";
            await bar.trigger("input");
            await bar.trigger("pointercancel");

            expect(wrapper.find("[data-test='mediaPlayerScrubTime']").exists()).toBe(false);
            expect(engine.handle.seek).not.toHaveBeenCalled();
        });

        it("shows no dot at rest, and the dot and a thicker bar under the finger", async () => {
            const wrapper = await playing();
            const bar = find(wrapper, "mediaPlayerSeek");
            expect(bar.classes()).toContain("[&::-webkit-slider-thumb]:opacity-0");
            expect(bar.classes()).not.toContain("[&::-webkit-slider-thumb]:opacity-100");
            // The drawn bar is what sits just before the slider that takes the touch.
            const drawn = () => bar.element.previousElementSibling as HTMLElement;
            expect(drawn().className).toContain("h-2");

            (bar.element as HTMLInputElement).value = "90";
            await bar.trigger("input");
            expect(bar.classes()).toContain("[&::-webkit-slider-thumb]:opacity-100");
            expect(drawn().className).toContain("h-3");
        });

        it("shows what is loaded only once it reaches visibly past what has played", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerLoaded']").exists()).toBe(true);

            // 0.3 s past the playhead of a 120 s video: under 2 px, a hairline at the yellow's corner.
            engine.state.bufferedEnd = 30.3;
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerLoaded']").exists()).toBe(false);

            engine.state.bufferedEnd = 45;
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerLoaded']").exists()).toBe(true);
        });

        it("rounds the ends of the bar, and meets what is loaded flat so the two do not mismatch", async () => {
            const wrapper = await playing();
            const loaded = find(wrapper, "mediaPlayerLoaded").element;
            expect(loaded.className).toContain("rounded-full");
            const played = loaded.nextElementSibling as HTMLElement;
            expect(played.className).toContain("bg-yellow-500");
            expect(played.className).toContain("rounded-l-full");
            // Loaded stretches on past it: its right end is flat against that.
            expect(played.className).not.toContain("rounded-r-full");

            // Nothing loaded beyond it: its right end is round again.
            engine.state.bufferedEnd = 30.3;
            await flushPromises();
            const alone = find(wrapper, "mediaPlayerSeek").element.previousElementSibling!
                .lastElementChild as HTMLElement;
            expect(alone.className).toContain("rounded-r-full");
        });

        it("draws what is loaded lighter than the track and darker than what has played", async () => {
            const wrapper = await playing();
            const loaded = find(wrapper, "mediaPlayerLoaded").classes().join(" ");
            expect(loaded).toContain("dark:bg-white/50");
            expect(find(wrapper, "mediaPlayerLoaded").element.parentElement!.className).toContain(
                "dark:bg-white/15",
            );
            expect(loaded).not.toContain("bg-yellow");
        });

        it("shows how much is loaded under what has played", async () => {
            const wrapper = await playing();
            expect(find(wrapper, "mediaPlayerLoaded").attributes("style")).toContain("width: 50%");
        });

        it("opens full-screen from the picture's corner", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerFullscreen").trigger("click");
            expect(engine.handle.enterFullscreen).toHaveBeenCalled();
        });

        it("gives the sound alone the same cover, wash and sleep timer on a wide screen as on a phone", async () => {
            await wide(async () => {
                isDarkTheme.value = true;
                const wrapper = await playing();
                await find(wrapper, "mediaPlayerAudio").trigger("click");
                await flushPromises();

                expect(find(wrapper, "mediaPlayerArtwork").exists()).toBe(true);
                expect(find(wrapper, "mediaPlayerSleep").exists()).toBe(true);
                expect(find(wrapper, "mediaPlayerFullscreen").exists()).toBe(true);

                expect(find(wrapper, "mediaPlayerWash").exists()).toBe(true);
            });
        });

        it("keeps the skip buttons, the bar and the speed out of sight until the duration is known", async () => {
            const wrapper = await playing();
            engine.state.duration = 0;
            await flushPromises();

            const skips = wrapper.findAll("button[aria-label^='media_player.skip']");
            expect(skips).toHaveLength(2);
            for (const skip of skips) expect(skip.classes()).toContain("invisible");
            expect(find(wrapper, "mediaPlayerSeekBar").classes()).toContain("invisible");
            // Left out of the row, not hidden in it: a hidden button still takes room, and the buttons
            // that are showing would sit off-centre until it came.
            expect(wrapper.find("button[aria-label='media_player.speed']").exists()).toBe(false);

            engine.state.duration = 120;
            await flushPromises();
            for (const skip of wrapper.findAll("button[aria-label^='media_player.skip']"))
                expect(skip.classes()).not.toContain("invisible");
            expect(wrapper.find("button[aria-label='media_player.speed']").exists()).toBe(true);
        });

        it("shows a spinner in the play button's place, not a paused button, while the source is on its way", async () => {
            const wrapper = await playing();
            engine.state.playing = false;
            engine.state.duration = 0;
            await flushPromises();
            expect(find(wrapper, "mediaPlayerStarting").exists()).toBe(true);
            // The picture is not black while it loads: the cover stands in for it.
            expect(find(wrapper, "mediaPlayerPoster").exists()).toBe(true);
            expect(find(wrapper, "mediaPlayerControls").classes()).toContain("invisible");

            engine.state.duration = 120;
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerStarting']").exists()).toBe(false);
            expect(wrapper.find("[data-test='mediaPlayerPoster']").exists()).toBe(false);
            expect(find(wrapper, "mediaPlayerControls").classes()).not.toContain("invisible");
        });

        it("shows a spinner over the picture while the engine has stalled", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerStalled']").exists()).toBe(false);

            engine.state.stalled = true;
            await flushPromises();
            expect(find(wrapper, "mediaPlayerStalled").exists()).toBe(true);
            // The picture is native's: it keeps the last frame up, and the cover would hide it.
            expect(wrapper.find("[data-test='mediaPlayerPoster']").exists()).toBe(false);

            engine.state.stalled = false;
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerStalled']").exists()).toBe(false);
            expect(wrapper.find("[data-test='mediaPlayerPoster']").exists()).toBe(false);
        });

        it("shows no spinner over an error", async () => {
            const wrapper = await playing();
            engine.state.playing = false;
            engine.state.duration = 0;
            engine.state.lifecycle = "error";
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerStarting']").exists()).toBe(false);
        });

        it("says a live stream is live in the bar's place, and keeps the room, so the play button stays put", async () => {
            const wrapper = await playing();
            engine.state.duration = 0;
            await flushPromises();
            engine.state.duration = Infinity;
            await flushPromises();

            // Nothing to seek: the skips and the bar are out of sight, but still take their room.
            const skips = wrapper.findAll("button[aria-label^='media_player.skip']");
            expect(skips).toHaveLength(2);
            for (const skip of skips) expect(skip.classes()).toContain("invisible");
            expect(find(wrapper, "mediaPlayerSeekBar").classes()).toContain("invisible");
            expect(wrapper.find("button[aria-label='media_player.speed']").exists()).toBe(false);
            // And the stream says what it is where the bar would be.
            expect(find(wrapper, "mediaPlayerLive").text()).toContain("media_player.live");
        });

        it("shows no live label for a recorded video", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerLive']").exists()).toBe(false);
        });

        it("marks the speed in force in the menu", async () => {
            const wrapper = await playing();
            await wrapper.find("button[aria-label='media_player.speed']").trigger("click");

            const rows = wrapper.findAll("li button");
            const chosen = rows.filter((row) => row.attributes("aria-current") === "true");
            expect(chosen.map((row) => row.text())).toEqual(["1x"]);
        });

        it("marks the audio language in force in the menu", async () => {
            const wrapper = await playing();
            await wrapper.find("button[aria-label='media_player.language']").trigger("click");

            const chosen = wrapper
                .findAll("li button")
                .filter((row) => row.attributes("aria-current") === "true");
            expect(chosen.map((row) => row.text())).toEqual(["English"]);
        });

        it("opens each menu beside its own button, and one at a time", async () => {
            const wrapper = await playing();
            const speed = wrapper.find("button[aria-label='media_player.speed']");
            const language = wrapper.find("button[aria-label='media_player.language']");

            await speed.trigger("click");
            expect(
                speed.element.parentElement!.querySelector("[data-test='mediaPlayerMenu']"),
            ).not.toBeNull();
            expect(
                language.element.parentElement!.querySelector("[data-test='mediaPlayerMenu']"),
            ).toBeNull();

            await language.trigger("click");
            expect(wrapper.findAll("[data-test='mediaPlayerMenu']")).toHaveLength(1);
            expect(
                language.element.parentElement!.querySelector("[data-test='mediaPlayerMenu']"),
            ).not.toBeNull();
            expect(
                speed.element.parentElement!.querySelector("[data-test='mediaPlayerMenu']"),
            ).toBeNull();
        });

        it("keeps the tabs on the bottom edge whatever is above them, as on a live stream with less to show", async () => {
            const wrapper = await playing();
            engine.state.chapters = [{ startTime: 0, endTime: 60, title: "Opening" }];
            await flushPromises();
            const tabs = wrapper.find("[role=tablist]");
            expect(tabs.classes()).toContain("mt-auto");
            // The column they sit in fills the player, so "auto" is the room under the controls.
            const column = tabs.element.parentElement!;
            expect(column.className).toContain("flex-col");
            expect(column.className).toContain("flex-1");
        });

        it("does not scroll as a whole, so nothing dark shows where it would move", async () => {
            const wrapper = await playing();
            const section = find(wrapper, "mediaPlayer").classes();
            expect(section).toContain("overflow-hidden");
            expect(section).not.toContain("overflow-y-auto");
        });

        it("scrolls nowhere: the part under the picture gives up its room instead", async () => {
            const wrapper = await playing();
            const scroller = find(wrapper, "mediaPlayerScroll").classes();
            // Not scrolling, and not clipping: the menus open upward, over the picture.
            expect(scroller).toContain("overflow-visible");
            expect(scroller).not.toContain("overflow-y-auto");
            expect(scroller).not.toContain("overflow-hidden");
            expect(scroller.some((name) => name.startsWith("bg-amber"))).toBe(true);
        });

        it("closes the menu on a tap anywhere else", async () => {
            const wrapper = await playing();
            await wrapper.find("button[aria-label='media_player.speed']").trigger("click");
            expect(wrapper.find("[data-test='mediaPlayerMenu']").exists()).toBe(true);

            await find(wrapper, "mediaPlayerMenuBackdrop").trigger("click");
            expect(wrapper.find("[data-test='mediaPlayerMenu']").exists()).toBe(false);
        });

        it("offers a sleep timer in the sound alone only, and asks for minutes, the chapter's end, or none", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerSleep']").exists()).toBe(false);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            engine.state.chapters = [{ startTime: 0, endTime: 60, title: "One" }];
            await flushPromises();

            await find(wrapper, "mediaPlayerSleep").trigger("click");
            await find(wrapper, "mediaPlayerSleep15").find("button").trigger("click");
            await find(wrapper, "mediaPlayerSleep").trigger("click");
            await find(wrapper, "mediaPlayerSleepChapter").find("button").trigger("click");
            await find(wrapper, "mediaPlayerSleep").trigger("click");
            await find(wrapper, "mediaPlayerSleepOff").find("button").trigger("click");

            expect(engine.controller.setSleepTimer.mock.calls).toEqual([
                [{ kind: "minutes", minutes: 15 }],
                [{ kind: "chapter" }],
                [null],
            ]);
        });

        it("opens the full-screen sound screen from the fullscreen button, and hands back from it", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerAudioFullscreen']").exists()).toBe(false);

            await find(wrapper, "mediaPlayerFullscreen").trigger("click");
            expect(find(wrapper, "audioFullscreenStub").text()).toBe(mockEnglishContentDto.title);

            const screen = wrapper.findComponent({ name: "AudioFullscreen" });
            screen.vm.$emit("seek", 42);
            screen.vm.$emit("rate", 1.5);
            screen.vm.$emit("sleep", { kind: "chapter" });
            expect(engine.controller.seek).toHaveBeenCalledWith(42);
            expect(engine.controller.setPlaybackRate).toHaveBeenCalledWith(1.5);
            expect(engine.controller.setSleepTimer).toHaveBeenCalledWith({ kind: "chapter" });

            screen.vm.$emit("exit");
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerAudioFullscreen']").exists()).toBe(false);
        });

        it("gives the full-screen sound screen the chapters to browse, and its own panel for them", async () => {
            const wrapper = await playing();
            engine.state.chapters = [
                { startTime: 0, endTime: 20, title: "One" },
                { startTime: 20, endTime: 120, title: "Two" },
            ];
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            await find(wrapper, "mediaPlayerFullscreen").trigger("click");

            const screen = wrapper.findComponent({ name: "AudioFullscreen" });
            expect(screen.props("hasBrowse")).toBe(true);
            expect(screen.props("chaptersSheet")).toBe(true);
        });

        it("gives the full-screen sound screen the app's stand-in picture when the post has no cover", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            await find(wrapper, "mediaPlayerFullscreen").trigger("click");

            expect(wrapper.findComponent({ name: "AudioFullscreen" }).props("artwork")).toEqual({
                src: "/stand-in.jpg",
            });
        });

        it("asks the browser for its full screen when the sound screen opens, and closes the screen when the browser leaves it", async () => {
            const request = vi.fn(() => Promise.resolve());
            const original = HTMLElement.prototype.requestFullscreen;
            HTMLElement.prototype.requestFullscreen = request;
            let fullscreenElement: Element | null = null;
            Object.defineProperty(document, "fullscreenElement", {
                configurable: true,
                get: () => fullscreenElement,
            });
            try {
                const wrapper = await playing();
                await find(wrapper, "mediaPlayerAudio").trigger("click");
                await flushPromises();
                await find(wrapper, "mediaPlayerFullscreen").trigger("click");
                await flushPromises();
                expect(request).toHaveBeenCalledTimes(1);
                expect(wrapper.find("[data-test='mediaPlayerAudioFullscreen']").exists()).toBe(true);
                // Marked as the host's own screen, so the player inside the card does not take it for its full screen.
                expect(
                    wrapper
                        .find("[data-test='mediaPlayerAudioFullscreen']")
                        .attributes("data-lmpl-host-screen"),
                ).toBeDefined();

                // The browser's own way out (Escape): the screen goes with it.
                fullscreenElement = wrapper.find("[data-test='mediaPlayerAudioFullscreen']").element;
                document.dispatchEvent(new Event("fullscreenchange"));
                expect(wrapper.find("[data-test='mediaPlayerAudioFullscreen']").exists()).toBe(true);
                fullscreenElement = null;
                document.dispatchEvent(new Event("fullscreenchange"));
                await flushPromises();
                expect(wrapper.find("[data-test='mediaPlayerAudioFullscreen']").exists()).toBe(false);
            } finally {
                HTMLElement.prototype.requestFullscreen = original;
                delete (document as { fullscreenElement?: unknown }).fullscreenElement;
            }
        });

        it("gives the browser's full screen back when the screen is closed from its own chevron", async () => {
            HTMLElement.prototype.requestFullscreen = vi.fn(() => Promise.resolve());
            const exit = vi.fn(() => Promise.resolve());
            (document as unknown as { exitFullscreen: unknown }).exitFullscreen = exit;
            let fullscreenElement: Element | null = null;
            Object.defineProperty(document, "fullscreenElement", {
                configurable: true,
                get: () => fullscreenElement,
            });
            try {
                const wrapper = await playing();
                await find(wrapper, "mediaPlayerAudio").trigger("click");
                await flushPromises();
                await find(wrapper, "mediaPlayerFullscreen").trigger("click");
                await flushPromises();
                const screen = wrapper.find("[data-test='mediaPlayerAudioFullscreen']");
                fullscreenElement = screen.element;

                wrapper.findComponent({ name: "AudioFullscreen" }).vm.$emit("exit");
                await flushPromises();
                expect(exit).toHaveBeenCalled();
            } finally {
                delete (document as { fullscreenElement?: unknown }).fullscreenElement;
                delete (document as { exitFullscreen?: unknown }).exitFullscreen;
            }
        });

        it("offers casting on the full-screen sound screen when the browser's player finds a device, and opens its list", async () => {
            engine.castAvailable = true;
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            await find(wrapper, "mediaPlayerFullscreen").trigger("click");
            await flushPromises();

            await find(wrapper, "mediaPlayerAudioFullscreenCast").trigger("click");
            expect(engine.handle.showCastPicker).toHaveBeenCalledTimes(1);
            engine.castAvailable = false;
        });

        it("tells the full-screen sound screen when the stream is live", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            engine.state.duration = Infinity;
            await find(wrapper, "mediaPlayerFullscreen").trigger("click");
            await flushPromises();
            expect(wrapper.findComponent({ name: "AudioFullscreen" }).props("live")).toBe(true);
        });

        it("leaves the full-screen sound screen when the picture is shown again", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            await find(wrapper, "mediaPlayerFullscreen").trigger("click");
            expect(wrapper.find("[data-test='mediaPlayerAudioFullscreen']").exists()).toBe(true);

            engine.state.isAudioOnly = false;
            engine.state.activeAngleId = "angle_0";
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerAudioFullscreen']").exists()).toBe(false);
        });

        it("says on the sleep button that a timer runs", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerSleepCaption']").exists()).toBe(false);

            engine.state.sleepTimer = { kind: "minutes", endsAt: Date.now() + 14 * 60_000 + 5_000 };
            await flushPromises();

            expect(find(wrapper, "mediaPlayerSleepCaption").text()).toBe(
                "media_player.sleep_left",
            );
        });

        it("changes speed from the menu", async () => {
            const wrapper = await playing();
            await wrapper.find("button[aria-label='media_player.speed']").trigger("click");
            const option = wrapper.findAll("li button").find((button) => button.text() === "1.5x");
            await option!.trigger("click");

            expect(engine.controller.setPlaybackRate).toHaveBeenCalledWith(1.5);
        });

        it("changes the audio language from the menu", async () => {
            const wrapper = await playing();
            await wrapper.find("button[aria-label='media_player.language']").trigger("click");
            const option = wrapper
                .findAll("li button")
                .find((button) => button.text() === "Français");
            await option!.trigger("click");

            expect(engine.controller.setAudioTrack).toHaveBeenCalledWith("fr");
        });

        it("turns subtitles on and off from the menu", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerSubtitles").trigger("click");
            await wrapper
                .findAll("li button")
                .find((button) => button.text() === "Français")!
                .trigger("click");
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith("sub-fr");

            await find(wrapper, "mediaPlayerSubtitles").trigger("click");
            await wrapper.findAll("li button")[0]!.trigger("click");
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith(null);
        });

        it("shows no subtitles button when the source has none", async () => {
            const wrapper = await playing();
            engine.state.subtitleTracks = [];
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerSubtitles']").exists()).toBe(false);
        });

        it("offers no language menu for a single track", async () => {
            const wrapper = await playing();
            engine.state.audioTracks = [{ id: "en", lang: "en", label: "English" }];
            await flushPromises();

            expect(wrapper.find("button[aria-label='media_player.language']").exists()).toBe(false);
        });
    });

    describe("over the chrome", () => {
        it("covers the whole screen on a phone, above the page's top bar and the mobile menu", async () => {
            const wrapper = await playing();
            const section = find(wrapper, "mediaPlayer");
            // The menu is z-50 and the page's top bar z-30; modals sit higher still, at z-[100].
            expect(section.classes()).toEqual(expect.arrayContaining(["fixed", "inset-0", "z-[60]"]));
            expect(section.attributes("style") ?? "").not.toContain("--media-player-top");
        });

        it("keeps its top bar clear of the status bar and its tabs clear of the home indicator", async () => {
            const wrapper = await playing();
            engine.state.chapters = [{ startTime: 0, endTime: 120, title: "One" }];
            await flushPromises();
            expect(find(wrapper, "mediaPlayerHandle").classes()).toContain(
                "max-lg:pt-[env(safe-area-inset-top)]",
            );
            expect(wrapper.find("[role='tablist']").classes()).toContain(
                "max-lg:pb-[max(env(safe-area-inset-bottom),var(--native-inset-bottom,0px))]",
            );
        });

        it("puts the chrome away while it is open on a phone, which takes the status bar with it", async () => {
            await narrow(async () => {
                const { hidden } = useMobileChromeAutoHide();
                hidden.value = false;
                await playing();
                expect(hidden.value).toBe(true);
            });
        });

        it("leaves the chrome be on a wide screen, where the player is a card in the corner", async () => {
            await wide(async () => {
                const { hidden } = useMobileChromeAutoHide();
                hidden.value = false;
                await playing();
                expect(hidden.value).toBe(false);
            });
        });

        it("fills the home indicator's space under the minimised bar", async () => {
            screenWide = false;
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            expect(find(wrapper, "mediaPlayerBar").classes()).toEqual(
                expect.arrayContaining([
                    "after:top-full",
                    "after:h-[max(env(safe-area-inset-bottom),var(--native-inset-bottom,0px))]",
                ]),
            );
        });

        it("hands the page back with its bars showing when it is minimised", async () => {
            const { hidden } = useMobileChromeAutoHide();
            await playing();
            // The page behind scrolled while the player covered it.
            hidden.value = true;
            minimiseMediaPlayer();
            await flushPromises();
            expect(hidden.value).toBe(false);
        });

        it("leaves the chrome to hide and show as the page is read when no player is open", async () => {
            const { hidden } = useMobileChromeAutoHide();
            hidden.value = false;
            mediaPlayerItem.value = null;
            await mountPlayer();

            hidden.value = true;
            await flushPromises();
            expect(hidden.value).toBe(true);
        });

        it("leaves it be while the player is minimised", async () => {
            const { hidden } = useMobileChromeAutoHide();
            await playing();
            minimiseMediaPlayer();
            await flushPromises();

            hidden.value = true;
            await flushPromises();
            expect(hidden.value).toBe(true);
        });
    });

    describe("mute and picture in picture", () => {
        it("are not shown where the platform has none", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerMute']").exists()).toBe(false);
            expect(wrapper.find("[data-test='mediaPlayerPictureInPicture']").exists()).toBe(false);
        });

        it("mute and unmute through the player, and picture in picture starts there", async () => {
            engine.canMute = true;
            const wrapper = await playing();

            await find(wrapper, "mediaPlayerMute").trigger("click");
            expect(engine.handle.setMuted).toHaveBeenLastCalledWith(true);

            engine.state.muted = true;
            await flushPromises();
            await find(wrapper, "mediaPlayerMute").trigger("click");
            expect(engine.handle.setMuted).toHaveBeenLastCalledWith(false);

            await find(wrapper, "mediaPlayerPictureInPicture").trigger("click");
            expect(engine.handle.startPictureInPicture).toHaveBeenCalled();
        });
    });

    describe("AirPlay", () => {
        it("is not offered until there is a device to send to", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerAirPlay']").exists()).toBe(false);
        });

        it("opens the system's device list", async () => {
            engine.airPlayAvailable = true;
            const wrapper = await playing();

            const button = find(wrapper, "mediaPlayerAirPlay");
            expect(button.attributes("aria-pressed")).toBe("false");
            await button.trigger("click");
            expect(engine.handle.showAirPlayPicker).toHaveBeenCalled();
        });

        it("is labelled Cast off Apple devices, where AirPlay does not exist", async () => {
            engine.airPlayAvailable = true;
            const wrapper = await playing();

            expect(find(wrapper, "mediaPlayerAirPlay").attributes("aria-label")).toBe(
                "media_player.cast",
            );
        });

        it("shows when playback is on a device", async () => {
            engine.airPlayAvailable = true;
            engine.airPlayActive = true;
            const wrapper = await playing();

            expect(find(wrapper, "mediaPlayerAirPlay").attributes("aria-pressed")).toBe("true");
        });
    });

    describe("the tabs under the picture (chapters, up next)", () => {
        const tabIds = (wrapper: VueWrapper) =>
            wrapper.findAll("[role=tab]").map((tab) => tab.attributes("data-test"));

        it("offers no tab, and has no About, when there is nothing next and no chapters", async () => {
            const wrapper = await playing();
            expect(tabIds(wrapper)).toEqual([]);
            expect(wrapper.find("[role=tablist]").exists()).toBe(false);
        });

        it("switches between the chapters and the lists that lead to other videos", async () => {
            upNextDocs.value = [
                {
                    ...mockEnglishContentDto,
                    _id: "next-1",
                    parentId: "next-1-parent",
                    title: "The next one",
                    video: "https://cdn.example.com/next.m3u8",
                },
            ];
            const wrapper = await playing();
            engine.state.chapters = [
                { startTime: 0, endTime: 60, title: "Opening" },
                { startTime: 60, endTime: 120, title: "The talk" },
            ];
            await flushPromises();
            expect(tabIds(wrapper)).toEqual(["mediaPlayerTab-chapters", "mediaPlayerTab-upnext"]);

            await find(wrapper, "mediaPlayerTab-upnext").trigger("click");
            expect(find(wrapper, "mediaPlayerSheet").text()).toContain("The next one");

            await find(wrapper, "mediaPlayerSheetTab-chapters").trigger("click");
            expect(find(wrapper, "mediaPlayerSheet").text()).toContain("The talk");
            expect(wrapper.find("[data-test='mediaPlayerUpNextItem']").exists()).toBe(false);
        });

        it("goes to a chapter and plays on from there", async () => {
            const wrapper = await playing();
            engine.state.chapters = [
                { startTime: 0, endTime: 60, title: "Opening" },
                { startTime: 60, endTime: 120, title: "The talk" },
            ];
            await flushPromises();
            await find(wrapper, "mediaPlayerTab-chapters").trigger("click");

            await wrapper.findAll("[data-test='mediaPlayerChapter']")[1]!.trigger("click");
            expect(engine.handle.seek).toHaveBeenLastCalledWith(60);
            expect(engine.handle.play).toHaveBeenCalled();
        });

        it("offers Chapters as the first tab when the video has them, and no tab without", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerTab-chapters']").exists()).toBe(false);

            engine.state.chapters = [
                { startTime: 0, endTime: 20, title: "Opening" },
                { startTime: 20, endTime: 120, title: "The talk" },
            ];
            await flushPromises();
            // Up next is there only when there is something to go on to.
            expect(tabIds(wrapper)).toEqual(["mediaPlayerTab-chapters"]);
        });

        it("shows the tabs at the top of the open sheet, the open one marked, and in the same order", async () => {
            upNextDocs.value = [
                {
                    ...mockEnglishContentDto,
                    _id: "next-1",
                    parentId: "next-1-parent",
                    title: "The next one",
                    video: "https://cdn.example.com/next.m3u8",
                },
            ];
            const wrapper = await playing();
            engine.state.chapters = [{ startTime: 0, endTime: 60, title: "Opening" }];
            await flushPromises();
            await find(wrapper, "mediaPlayerTab-chapters").trigger("click");

            const sheetTabs = wrapper
                .findAll("[data-test^='mediaPlayerSheetTab-']")
                .map((tab) => tab.attributes("data-test"));
            expect(sheetTabs).toEqual([
                "mediaPlayerSheetTab-chapters",
                "mediaPlayerSheetTab-upnext",
            ]);
            expect(find(wrapper, "mediaPlayerSheetTab-chapters").attributes("aria-selected")).toBe(
                "true",
            );
            // The bar at the foot keeps its room but is out of sight while the sheet is open, so the player does not
            // change height as the sheet comes and goes.
            const foot = wrapper.find("[role='tablist'].sticky");
            expect(foot.classes()).toContain("invisible");
            expect(foot.attributes("aria-hidden")).toBe("true");

            await find(wrapper, "mediaPlayerSheetTab-upnext").trigger("click");
            expect(find(wrapper, "mediaPlayerSheetTab-upnext").attributes("aria-selected")).toBe(
                "true",
            );
            expect(find(wrapper, "mediaPlayerSheetTab-chapters").attributes("aria-selected")).toBe(
                "false",
            );
        });

        describe("swiping the sheet down", () => {
            const touch = (y: number) => ({ touches: [{ clientY: y }] });
            const sheetStyle = (wrapper: VueWrapper) =>
                find(wrapper, "mediaPlayerSheet").attributes("style") ?? "";

            async function openSheet() {
                const wrapper = await playing();
                engine.state.chapters = [
                    { startTime: 0, endTime: 20, title: "Opening" },
                    { startTime: 20, endTime: 120, title: "The talk" },
                ];
                await flushPromises();
                await find(wrapper, "mediaPlayerTab-chapters").trigger("click");
                return wrapper;
            }

            it("follows the thumb down, and springs back when it is let go short of the way", async () => {
                const wrapper = await openSheet();
                const sheet = find(wrapper, "mediaPlayerSheet");
                await sheet.trigger("touchstart", touch(100));
                await sheet.trigger("touchmove", touch(130));
                expect(sheetStyle(wrapper)).toContain("translateY(30px)");
                // Following the thumb, with no easing of its own to lag behind it.
                expect(sheetStyle(wrapper)).toContain("transition: none");

                await sheet.trigger("touchend");
                expect(wrapper.find("[data-test='mediaPlayerSheet']").exists()).toBe(true);
                expect(sheetStyle(wrapper)).not.toContain("translateY");
            });

            it("slides away and goes when it is drawn down far enough", async () => {
                const wrapper = await openSheet();
                const sheet = find(wrapper, "mediaPlayerSheet");
                await sheet.trigger("touchstart", touch(100));
                await sheet.trigger("touchmove", touch(450));
                await sheet.trigger("touchend");
                // On its way: moved off, but still there until it has gone.
                expect(wrapper.find("[data-test='mediaPlayerSheet']").exists()).toBe(true);

                await slideAway();
                await flushPromises();
                expect(wrapper.find("[data-test='mediaPlayerSheet']").exists()).toBe(false);
                expect(wrapper.find("[data-test='mediaPlayerTab-chapters']").exists()).toBe(true);
            });

            it("springs back from a short pull, past the old eighty pixels", async () => {
                const wrapper = await openSheet();
                const sheet = find(wrapper, "mediaPlayerSheet");
                await sheet.trigger("touchstart", touch(100));
                await sheet.trigger("touchmove", touch(200));
                await sheet.trigger("touchend");
                await slideAway();
                expect(wrapper.find("[data-test='mediaPlayerSheet']").exists()).toBe(true);
                expect(sheetStyle(wrapper)).not.toContain("translateY");
            });

            it("does not move on a swipe up", async () => {
                const wrapper = await openSheet();
                const sheet = find(wrapper, "mediaPlayerSheet");
                await sheet.trigger("touchstart", touch(300));
                await sheet.trigger("touchmove", touch(100));
                await sheet.trigger("touchend");
                expect(wrapper.find("[data-test='mediaPlayerSheet']").exists()).toBe(true);
                expect(sheetStyle(wrapper)).not.toContain("translateY");
            });

            it("leaves a list that is scrolled down to scroll back up first", async () => {
                const wrapper = await playing();
                engine.state.chapters = [
                    { startTime: 0, endTime: 20, title: "Opening" },
                    { startTime: 20, endTime: 120, title: "The talk" },
                ];
                await flushPromises();
                await find(wrapper, "mediaPlayerTab-chapters").trigger("click");

                const list = wrapper.find("ol").element as HTMLElement;
                list.scrollTop = 80;
                const row = wrapper.find("[data-test='mediaPlayerChapter']");
                await row.trigger("touchstart", touch(100));
                await row.trigger("touchmove", touch(220));
                await row.trigger("touchend");
                expect(sheetStyle(wrapper)).not.toContain("translateY");

                // At the top of the list the same pull is the sheet's.
                list.scrollTop = 0;
                await row.trigger("touchstart", touch(100));
                await row.trigger("touchmove", touch(450));
                await row.trigger("touchend");
                await slideAway();
                await flushPromises();
                expect(wrapper.find("[data-test='mediaPlayerSheet']").exists()).toBe(false);
            });
        });

        it("closes the sheet from its grabber, and the tabs at the foot come back", async () => {
            const wrapper = await playing();
            engine.state.chapters = [{ startTime: 0, endTime: 60, title: "Opening" }];
            await flushPromises();
            await find(wrapper, "mediaPlayerTab-chapters").trigger("click");
            await find(wrapper, "mediaPlayerSheetClose").trigger("click");
            await slideAway();
            await flushPromises();

            expect(wrapper.find("[data-test='mediaPlayerSheet']").exists()).toBe(false);
            expect(wrapper.find("[data-test='mediaPlayerTab-chapters']").exists()).toBe(true);
        });

        it("marks the chapter playing now in words, and writes where each starts and how long it runs", async () => {
            const wrapper = await playing();
            engine.state.chapters = [
                { startTime: 0, endTime: 20, title: "Opening" },
                { startTime: 20, endTime: 140, title: "The talk" },
            ];
            await flushPromises();
            await find(wrapper, "mediaPlayerTab-chapters").trigger("click");

            const rows = wrapper.findAll("[data-test='mediaPlayerChapter']");
            expect(rows[0]!.find("[data-test='mediaPlayerChapterNow']").exists()).toBe(false);
            expect(rows[1]!.find("[data-test='mediaPlayerChapterNow']").exists()).toBe(true);
            // The words come from the translations, which these tests leave out: the key stands in.
            expect(rows[1]!.find("[data-test='mediaPlayerChapterNow']").text()).toBe(
                "media_player.chapter_now",
            );
            expect(rows[1]!.find("[data-test='mediaPlayerChapterTime']").text()).toContain(
                "0:20 · ",
            );
            expect(rows[1]!.text()).toContain("The talk");
        });

        it("leads a chapter with a frame of the video when it has one, and is text without", async () => {
            const chapters = [
                { startTime: 0, endTime: 20, title: "Opening" },
                { startTime: 20, endTime: 140, title: "The talk" },
            ];
            const without = await playing();
            engine.state.chapters = chapters;
            await flushPromises();
            await find(without, "mediaPlayerTab-chapters").trigger("click");
            expect(without.find("[data-test='mediaPlayerChapterFrame']").exists()).toBe(false);
            without.unmount();

            engine.thumbnailsReady = true;
            const wrapper = await playing();
            engine.state.chapters = chapters;
            await flushPromises();
            await find(wrapper, "mediaPlayerTab-chapters").trigger("click");
            const frames = wrapper.findAll("[data-test='mediaPlayerChapterFrame']");
            expect(frames).toHaveLength(2);
            expect(frames[0]!.attributes("style")).toContain("width: 72px");
            // Each frame carries a bar for how much of its chapter has played.
            expect(wrapper.findAll("[data-test='mediaPlayerChapterProgress']")).toHaveLength(2);
            expect(engine.controller.thumbnailAt).toHaveBeenCalledWith(20);
        });

        it("has no strip for the chapters: they are a tab", async () => {
            const wrapper = await playing();
            engine.state.chapters = [{ startTime: 0, endTime: 60, title: "Opening" }];
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerChapterStrip']").exists()).toBe(false);
        });

        it("marks the chapter the playhead is in", async () => {
            const wrapper = await playing();
            engine.state.chapters = [
                { startTime: 0, endTime: 20, title: "Opening" },
                { startTime: 20, endTime: 120, title: "The talk" },
            ];
            await flushPromises();
            await find(wrapper, "mediaPlayerTab-chapters").trigger("click");

            const rows = wrapper.findAll("[data-test='mediaPlayerChapter']");
            expect(rows[0]!.attributes("aria-current")).toBeUndefined();
            expect(rows[1]!.attributes("aria-current")).toBe("true");
        });

        it("plays another video from up next, which takes the player", async () => {
            const next = {
                ...mockEnglishContentDto,
                _id: "next-1",
                parentId: "next-1-parent",
                title: "The next one",
                video: "https://cdn.example.com/next.m3u8",
            };
            upNextDocs.value = [next];
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerTab-upnext").trigger("click");

            await find(wrapper, "mediaPlayerUpNextItem").trigger("click");
            expect(mediaPlayerItem.value?.content._id).toBe("next-1");
        });

        it("offers only content that has media, and not the content's own other translations", async () => {
            upNextDocs.value = [
                {
                    ...mockEnglishContentDto,
                    _id: "article",
                    parentId: "article-parent",
                    video: undefined,
                    parentMedia: undefined,
                },
                {
                    ...mockEnglishContentDto,
                    _id: "translation",
                    video: "https://cdn.example.com/t.m3u8",
                },
            ];
            const wrapper = await playing();
            expect(tabIds(wrapper)).toEqual([]);
        });

        it("still offers what has been seen, after what has not", async () => {
            const doc = (id: string) => ({
                ...mockEnglishContentDto,
                _id: id,
                parentId: `${id}-parent`,
                title: id,
                video: "https://cdn.example.com/x.m3u8",
            });
            markSeen("seen-one");
            upNextDocs.value = [doc("seen-one"), doc("fresh-one")];
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerTab-upnext").trigger("click");

            const titles = wrapper
                .findAll("[data-test='mediaPlayerUpNextItem']")
                .map((row) => row.text());
            expect(titles[0]).toContain("fresh-one");
            expect(titles[1]).toContain("seen-one");
        });

        it("puts the next in the series first, in date order, and the rest as related", async () => {
            const doc = (id: string, publishDate: number, parentTags: string[]) => ({
                ...mockEnglishContentDto,
                _id: id,
                parentId: `${id}-parent`,
                title: id,
                publishDate,
                parentTags,
                video: "https://cdn.example.com/x.m3u8",
            });
            // Playing the Friday: the Sunday and Saturday of the conference come after it, the
            // Thursday before it, and an unrelated topic's video shares only a topic.
            mediaPlayerItem.value = null;
            openMediaPlayer(
                { ...mockEnglishContentDto, publishDate: 100, parentTags: ["conf", "topic"] },
                "en",
            );
            categoryDocs.value = [{ ...mockEnglishContentDto, _id: "tag-conf", parentId: "conf" }];
            upNextDocs.value = [
                doc("sunday", 300, ["conf"]),
                doc("thursday", 50, ["conf"]),
                doc("other-topic", 400, ["topic"]),
                doc("saturday", 200, ["conf"]),
            ];
            const wrapper = await mountPlayer();
            await find(wrapper, "mediaPlayerTab-upnext").trigger("click");

            const rows = (section: string) =>
                find(wrapper, `mediaPlayerUpNext-${section}`)
                    .findAll("[data-test='mediaPlayerUpNextItem']")
                    .map((row) => row.text());
            // The whole series in date order, the playing one marked where it stands.
            const series = rows("series");
            expect(series).toHaveLength(4);
            expect(series[0]).toContain("thursday");
            expect(series[2]).toContain("saturday");
            expect(series[3]).toContain("sunday");
            const playing = find(wrapper, "mediaPlayerUpNext-series").findAll(
                "[data-test='mediaPlayerUpNextItem'][data-current='true']",
            );
            expect(playing).toHaveLength(1);
            expect(playing[0].text()).toBe(series[1]);
            const related = rows("related").join(" ");
            expect(related).toContain("other-topic");
            expect(related).not.toContain("thursday");
            expect(related).not.toContain("saturday");
        });

        describe("choosing a tag", () => {
            const doc = (id: string, publishDate: number, parentTags: string[]) => ({
                ...mockEnglishContentDto,
                _id: id,
                parentId: `${id}-parent`,
                title: id,
                publishDate,
                parentTags,
                video: "https://cdn.example.com/x.m3u8",
            });
            const tag = (id: string, title: string) => ({
                ...mockEnglishContentDto,
                _id: `tag-${id}`,
                parentId: id,
                title,
            });
            const rows = (wrapper: Awaited<ReturnType<typeof mountPlayer>>, section: string) =>
                wrapper.find(`[data-test='mediaPlayerUpNext-${section}']`).exists()
                    ? find(wrapper, `mediaPlayerUpNext-${section}`)
                          .findAll("[data-test='mediaPlayerUpNextItem']")
                          .map((row) => row.text())
                    : [];

            async function openWithTags(tags: string[]) {
                mediaPlayerItem.value = null;
                openMediaPlayer(
                    { ...mockEnglishContentDto, publishDate: 100, parentTags: tags },
                    "en",
                );
                categoryDocs.value = [tag("conf", "Conference")];
                tagDocs.value = [
                    tag("youth", "Youth"),
                    tag("conf", "Conference"),
                    tag("prayer", "Prayer"),
                ];
                upNextDocs.value = [
                    doc("sunday", 300, ["conf", "prayer"]),
                    doc("saturday", 200, ["conf", "youth"]),
                    doc("worship", 50, ["prayer", "youth"]),
                ];
                const wrapper = await mountPlayer();
                await find(wrapper, "mediaPlayerTab-upnext").trigger("click");
                return wrapper;
            }

            it("offers the tags, the series first, only when there are two or more", async () => {
                const wrapper = await openWithTags(["youth", "conf", "prayer"]);
                const chips = wrapper
                    .findAll("[data-test^='mediaPlayerUpNextTag-']")
                    .map((chip) => chip.text());
                expect(chips).toEqual(["media_player.all_tags", "Conference", "Youth", "Prayer"]);
                expect(find(wrapper, "mediaPlayerUpNextTag-all").attributes("aria-pressed")).toBe(
                    "true",
                );
            });

            it("shows no chips for a video with one tag", async () => {
                const wrapper = await openWithTags(["conf"]);
                expect(wrapper.find("[data-test='mediaPlayerUpNextTags']").exists()).toBe(false);
            });

            it("narrows to a series: its next ones, and what else it holds", async () => {
                const wrapper = await openWithTags(["youth", "conf", "prayer"]);
                await find(wrapper, "mediaPlayerUpNextTag-conf").trigger("click");

                const series = rows(wrapper, "series");
                expect(series).toHaveLength(3);
                expect(series[1]).toContain("saturday");
                expect(series[2]).toContain("sunday");
                expect(rows(wrapper, "related").join(" ")).not.toContain("worship");
            });

            it("narrows to a topic: no next, only what has the topic", async () => {
                const wrapper = await openWithTags(["youth", "conf", "prayer"]);
                await find(wrapper, "mediaPlayerUpNextTag-youth").trigger("click");

                expect(wrapper.find("[data-test='mediaPlayerUpNext-series']").exists()).toBe(false);
                const related = rows(wrapper, "related").join(" ");
                expect(related).toContain("saturday");
                expect(related).toContain("worship");
                expect(related).not.toContain("sunday");
            });

            it("goes back to all on a second tap, or on All", async () => {
                const wrapper = await openWithTags(["youth", "conf", "prayer"]);
                await find(wrapper, "mediaPlayerUpNextTag-youth").trigger("click");
                await find(wrapper, "mediaPlayerUpNextTag-youth").trigger("click");
                expect(find(wrapper, "mediaPlayerUpNextTag-all").attributes("aria-pressed")).toBe(
                    "true",
                );

                await find(wrapper, "mediaPlayerUpNextTag-prayer").trigger("click");
                await find(wrapper, "mediaPlayerUpNextTag-all").trigger("click");
                expect(rows(wrapper, "series")).toHaveLength(3);
            });

            it("says so, and keeps the tab, when a tag has nothing else", async () => {
                const wrapper = await openWithTags(["youth", "conf", "prayer"]);
                upNextDocs.value = [];
                await find(wrapper, "mediaPlayerUpNextTag-youth").trigger("click");
                await flushPromises();

                expect(find(wrapper, "mediaPlayerUpNextEmpty").exists()).toBe(true);
                expect(find(wrapper, "mediaPlayerSheetTab-upnext").exists()).toBe(true);
            });

            it("keeps the section open while a choice loads, and when going back to All", async () => {
                const wrapper = await openWithTags(["youth", "conf", "prayer"]);
                const kept = upNextDocs.value;
                await find(wrapper, "mediaPlayerUpNextTag-youth").trigger("click");

                // The lists are empty for a moment while the other tag is asked for.
                upNextDocs.value = [];
                await find(wrapper, "mediaPlayerUpNextTag-all").trigger("click");
                await flushPromises();
                expect(find(wrapper, "mediaPlayerSheet").exists()).toBe(true);
                expect(find(wrapper, "mediaPlayerSheetTab-upnext").exists()).toBe(true);

                // The answer arrives: asking again shows it.
                upNextDocs.value = kept;
                await find(wrapper, "mediaPlayerUpNextTag-conf").trigger("click");
                await flushPromises();
                expect(rows(wrapper, "series")).toHaveLength(3);
            });

            it("starts the next video at All", async () => {
                const wrapper = await openWithTags(["youth", "conf", "prayer"]);
                await find(wrapper, "mediaPlayerUpNextTag-youth").trigger("click");
                openMediaPlayer(
                    {
                        ...mockEnglishContentDto,
                        _id: "other",
                        parentId: "other-parent",
                        parentTags: ["youth", "conf"],
                    },
                    "en",
                );
                await flushPromises();
                await find(wrapper, "mediaPlayerTab-upnext").trigger("click");
                expect(find(wrapper, "mediaPlayerUpNextTag-all").attributes("aria-pressed")).toBe(
                    "true",
                );
            });
        });

        it("closes a tab whose content went away", async () => {
            const wrapper = await playing();
            engine.state.chapters = [{ startTime: 0, endTime: 60, title: "Opening" }];
            await flushPromises();
            await find(wrapper, "mediaPlayerTab-chapters").trigger("click");
            expect(find(wrapper, "mediaPlayerSheet").exists()).toBe(true);

            engine.state.chapters = [];
            await flushPromises();
            expect(find(wrapper, "mediaPlayerSheet").exists()).toBe(false);
        });
    });

    describe("the page of what plays", () => {
        const withText = () => {
            openMediaPlayer(
                { ...mockEnglishContentDto, text: "<p>The article.</p>", slug: "the-slug" },
                "en",
            );
            return mountPlayer();
        };

        it("has no About: the summary, article and categories are on the page", async () => {
            const wrapper = await withText();
            expect(wrapper.find("[data-test^='mediaPlayerTab-']").exists()).toBe(false);
            expect(find(wrapper, "mediaPlayerAbout").exists()).toBe(false);
        });

        it("goes to the page of what plays from the bar", async () => {
            screenWide = false;
            const wrapper = await withText();
            minimiseMediaPlayer();
            await flushPromises();
            await find(wrapper, "mediaPlayerBarRead").trigger("click");
            expect(routerPush).toHaveBeenCalledWith({
                name: "content",
                params: { slug: "the-slug" },
            });
        });
    });

    describe("the header of the player", () => {
        it("leaves a press on a button to the button, so its click is not sent to the header", async () => {
            const wrapper = await playing();
            const handle = find(wrapper, "mediaPlayerHandle");
            const capture = vi.fn();
            (handle.element as HTMLElement).setPointerCapture = capture;

            await find(wrapper, "mediaPlayerAudio").trigger("pointerdown", { pointerId: 1 });
            expect(capture).not.toHaveBeenCalled();

            await handle.trigger("pointerdown", { pointerId: 1 });
            expect(capture).toHaveBeenCalledTimes(1);
        });

        it("closes an open sheet on Escape before it minimises the player, and from its own close button", async () => {
            const wrapper = await playing();
            engine.state.chapters = [{ startTime: 0, endTime: 120, title: "One" }];
            await flushPromises();
            await find(wrapper, "mediaPlayerTab-chapters").trigger("click");
            await flushPromises();
            expect(find(wrapper, "mediaPlayerSheet").exists()).toBe(true);

            await find(wrapper, "mediaPlayer").trigger("keydown", { key: "Escape" });
            await new Promise((resolve) => setTimeout(resolve, 400));
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerSheet']").exists()).toBe(false);
            expect(mediaPlayerView.value).toBe("expanded");

            await find(wrapper, "mediaPlayerTab-chapters").trigger("click");
            await flushPromises();
            await find(wrapper, "mediaPlayerSheetCloseButton").trigger("click");
            await new Promise((resolve) => setTimeout(resolve, 400));
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerSheet']").exists()).toBe(false);

            await find(wrapper, "mediaPlayer").trigger("keydown", { key: "Escape" });
            expect(mediaPlayerView.value).toBe("mini");
        });
    });

    describe("on a phone: the now-playing screen", () => {
        beforeEach(() => {
            screenWide = false;
        });
        const screen = (wrapper: VueWrapper) => wrapper.findComponent({ name: "AudioFullscreen" });

        it("takes the card's place, dark, with the engine playing in its stage", async () => {
            const wrapper = await playing();
            expect(find(wrapper, "mediaPlayerNowPlaying").exists()).toBe(true);
            expect(find(wrapper, "mediaPlayerPlayPause").exists()).toBe(false);
            expect(engine.mounts).toBe(1);
            expect(find(wrapper, "audioFullscreenStage").find("*").exists()).toBe(true);

            const props = screen(wrapper).props();
            expect(props.stage).toBe("video");
            expect(props.appearance).toBe("dark");
            expect(props.exitLabel).toBe("media_player.minimise");
            expect(props.stageHole).toBe(false);
            expect(props.title).toBe(mockEnglishContentDto.title);
        });

        it("switches to the sound alone on the same engine, which never stops", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(screen(wrapper).props().stage).toBe("cover");
            expect(engine.mounts).toBe(1);
            expect(
                find(wrapper, "audioFullscreenTop").find("[data-test='mediaPlayerVideo']").exists(),
            ).toBe(true);
        });

        it("shows the player busy while the source loads, or when playback is stuck, and not once it plays", async () => {
            const wrapper = await playing();
            expect(screen(wrapper).props().busy).toBe(false);

            engine.state.lifecycle = "loading";
            await flushPromises();
            expect(screen(wrapper).props().busy).toBe(true);

            engine.state.lifecycle = "ready";
            engine.state.stalled = true;
            await flushPromises();
            expect(screen(wrapper).props().busy).toBe(true);

            engine.state.stalled = false;
            await flushPromises();
            expect(screen(wrapper).props().busy).toBe(false);
        });

        it("shows the player busy from a pick until the picked video plays, and for a while at most", async () => {
            const next = {
                ...mockEnglishContentDto,
                _id: "next-1",
                parentId: "next-1-parent",
                title: "The next one",
                video: "https://cdn.example.com/next.m3u8",
            };
            const after = { ...next, _id: "next-2", parentId: "next-2-parent", title: "The one after" };
            upNextDocs.value = [next, after];
            const wrapper = await playing();
            screen(wrapper).vm.$emit("upnextselect", "next-1");
            await flushPromises();
            expect(mediaPlayerItem.value?.content._id).toBe("next-1");
            // The video before stands paused while the next one is prepared.
            engine.state.playing = false;
            await flushPromises();
            expect(screen(wrapper).props().busy).toBe(true);

            engine.state.playing = true;
            await flushPromises();
            expect(screen(wrapper).props().busy).toBe(false);

            vi.useFakeTimers();
            try {
                screen(wrapper).vm.$emit("upnextselect", "next-2");
                await flushPromises();
                expect(screen(wrapper).props().busy).toBe(true);
                vi.advanceTimersByTime(15_000);
                await flushPromises();
                expect(screen(wrapper).props().busy).toBe(false);
            } finally {
                vi.useRealTimers();
            }
        });

        it("lets the pages turn with the phone while the sound screen is open, and only then", async () => {
            const setPagesTurn = vi.fn();
            openMediaPlayer(mockEnglishContentDto, "en");
            const wrapper = await mountPlayer({
                [PlatformChromeKey]: { chromeFadeEnabled: false, setStatusBarHidden: vi.fn(), setPagesTurn },
            });
            expect(setPagesTurn).toHaveBeenLastCalledWith(false);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(setPagesTurn).toHaveBeenLastCalledWith(true);

            minimiseMediaPlayer();
            await flushPromises();
            expect(setPagesTurn).toHaveBeenLastCalledWith(false);

            openMediaPlayer(mockEnglishContentDto, "en");
            await flushPromises();
            expect(setPagesTurn).toHaveBeenLastCalledWith(true);
            wrappers.splice(wrappers.indexOf(wrapper), 1);
            wrapper.unmount();
            expect(setPagesTurn).toHaveBeenLastCalledWith(false);
        });

        it("leaves a band under the picture for the subtitles the packaged app draws, on every phone", async () => {
            vi.stubEnv("VITE_BUILD_TARGET", "native");
            try {
                const wrapper = await playing();
                expect(wrapper.findComponent({ name: "VideoPlayer" }).props("captionBand")).toBeGreaterThan(0);
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it("leaves its stage clear for a picture the platform draws behind the page", async () => {
            engine.inlineActive = true;
            const wrapper = await playing();
            expect(screen(wrapper).props().stageHole).toBe(true);
        });

        it("places the picture drawn behind the page again when its stage moves", async () => {
            const wrapper = await playing();
            const resized = vi.fn();
            window.addEventListener("resize", resized);
            try {
                screen(wrapper).vm.$emit("stagechange");
                await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
                await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
                expect(resized).toHaveBeenCalled();
            } finally {
                window.removeEventListener("resize", resized);
            }
        });

        it("minimises from its chevron, and has no close button of its own", async () => {
            const wrapper = await playing();
            expect(find(wrapper, "mediaPlayerClose").exists()).toBe(false);
            screen(wrapper).vm.$emit("exit");
            await flushPromises();
            expect(mediaPlayerView.value).toBe("mini");
            expect(find(wrapper, "mediaPlayerBar").exists()).toBe(true);
        });

        it("is drawn down only from its top line", async () => {
            const wrapper = await playing();
            const sectionStyle = () => find(wrapper, "mediaPlayer").attributes("style") ?? "";
            await find(wrapper, "audioFullscreenStub").trigger("pointerdown", { clientY: 100, pointerId: 1 });
            await find(wrapper, "audioFullscreenStub").trigger("pointermove", { clientY: 200, pointerId: 1 });
            expect(sectionStyle()).not.toContain("--tw-translate-y");

            await find(wrapper, "audioFullscreenTop").trigger("pointerdown", { clientY: 100, pointerId: 1 });
            await find(wrapper, "audioFullscreenTop").trigger("pointermove", { clientY: 160, pointerId: 1 });
            expect(sectionStyle()).toContain("--tw-translate-y: 60px");
        });

        it("hands what is asked to the player", async () => {
            const wrapper = await playing();
            const view = screen(wrapper);
            view.vm.$emit("toggle-play");
            view.vm.$emit("seek", 42);
            view.vm.$emit("subtitle-track", "sub-fr");
            view.vm.$emit("picture-in-picture");
            view.vm.$emit("fullscreen");
            view.vm.$emit("rate", 1.5);
            await flushPromises();
            expect(engine.handle.pause).toHaveBeenCalled();
            expect(engine.handle.seek).toHaveBeenCalledWith(42);
            expect(engine.controller.setSubtitleTrack).toHaveBeenCalledWith("sub-fr");
            expect(engine.handle.startPictureInPicture).toHaveBeenCalled();
            expect(engine.handle.enterFullscreen).toHaveBeenCalled();
            expect(engine.controller.setPlaybackRate).toHaveBeenCalledWith(1.5);
        });

        it("turns a subtitle track on for the lyrics with sound alone, and gives the picture its own choice back", async () => {
            const wrapper = await playing();
            engine.handle.subtitleCues = [{ start: 1, end: 3, text: "Help me, Your Word to obey!" }];
            expect(screen(wrapper).props().lyrics).toEqual([]);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith("sub-fr");
            expect(screen(wrapper).props().lyrics).toEqual(engine.handle.subtitleCues);

            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith(null);
            expect(screen(wrapper).props().lyrics).toEqual([]);
        });

        it("leaves the subtitles the viewer chose alone", async () => {
            const wrapper = await playing();
            engine.state.activeSubtitleTrackId = "sub-fr";
            await flushPromises();
            engine.controller.setSubtitleTrack.mockClear();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();
            expect(engine.controller.setSubtitleTrack).not.toHaveBeenCalled();
        });
    });

    describe("keyboard shortcuts", () => {
        const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => {
            const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
            target.dispatchEvent(event);
            return event;
        };

        it("play, pause and skip from anywhere on the page while the player is open, minimised too", async () => {
            await playing();

            expect(press(" ").defaultPrevented).toBe(true);
            expect(engine.handle.pause).toHaveBeenCalledTimes(1);
            press("ArrowRight");
            expect(engine.handle.seek).toHaveBeenLastCalledWith(40);
            press("j");
            expect(engine.handle.seek).toHaveBeenLastCalledWith(20);

            minimiseMediaPlayer();
            await flushPromises();
            press("k");
            expect(engine.handle.pause).toHaveBeenCalledTimes(2);
        });

        it("jump to a tenth of the way with the digits", async () => {
            await playing();
            press("5");
            expect(engine.handle.seek).toHaveBeenLastCalledWith(60);
            press("0");
            expect(engine.handle.seek).toHaveBeenLastCalledWith(0);
        });

        it("step the volume and mute through the player, unmuting it when the volume goes up", async () => {
            await playing();
            press("ArrowUp");
            expect(engine.handle.setVolume).toHaveBeenLastCalledWith(0.6);
            press("ArrowDown");
            expect(engine.handle.setVolume).toHaveBeenLastCalledWith(0.4);

            press("m");
            expect(engine.handle.setMuted).toHaveBeenLastCalledWith(true);
            engine.state.muted = true;
            await flushPromises();
            press("ArrowUp");
            expect(engine.handle.setMuted).toHaveBeenLastCalledWith(false);
        });

        it("step through the player's speeds and turn the subtitles on and off", async () => {
            await playing();
            press(">", { shiftKey: true });
            expect(engine.controller.setPlaybackRate).toHaveBeenLastCalledWith(1.5);
            press("<", { shiftKey: true });
            expect(engine.controller.setPlaybackRate).toHaveBeenLastCalledWith(0.7);

            press("c");
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith("sub-fr");
            engine.state.activeSubtitleTrackId = "sub-fr";
            await flushPromises();
            press("c");
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith(null);
        });

        it("open full-screen with F, and the sound screen in audio mode", async () => {
            const wrapper = await playing();
            press("f");
            expect(engine.handle.enterFullscreen).toHaveBeenCalled();

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            press("f");
            await flushPromises();
            expect(find(wrapper, "audioFullscreenStub").exists()).toBe(true);
        });

        it("leave keys to a field being typed in, and to an open modal", async () => {
            await playing();
            const input = document.createElement("input");
            document.body.appendChild(input);
            press(" ", {}, input);
            expect(engine.handle.pause).not.toHaveBeenCalled();
            input.remove();

            const modal = document.createElement("div");
            modal.setAttribute("aria-modal", "true");
            document.body.appendChild(modal);
            press("k");
            expect(engine.handle.pause).not.toHaveBeenCalled();
            modal.remove();
        });

        it("are off in the packaged app", async () => {
            vi.stubEnv("VITE_BUILD_TARGET", "native");
            try {
                await playing();
                press(" ");
                expect(engine.handle.pause).not.toHaveBeenCalled();
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it("stop when the player closes", async () => {
            await playing();
            closeMediaPlayer();
            await flushPromises();
            press(" ");
            expect(engine.handle.pause).not.toHaveBeenCalled();
        });
    });

    describe("a live stream", () => {
        it("is not starting while it is paused, shows Live, and keeps its play button, whatever length the engine reports", async () => {
            const wrapper = await playing();
            engine.state.live = true;
            engine.state.duration = 0;
            engine.state.playing = false;
            await flushPromises();

            expect(wrapper.find("[data-test='mediaPlayerLive']").exists()).toBe(true);
            expect(find(wrapper, "mediaPlayerPlayPause").classes()).not.toContain("invisible");
            expect(wrapper.find("[data-test='mediaPlayerStarting']").exists()).toBe(false);
            expect(find(wrapper, "mediaPlayerSkipBack").classes()).toContain("invisible");
        });

        it("is told to the full-screen sound screen, and the minimised video keeps only play, expand and close", async () => {
            await wide(async () => {
                const wrapper = await playing();
                engine.state.live = true;
                engine.state.duration = 0;
                await flushPromises();
                await find(wrapper, "mediaPlayerMinimise").trigger("click");
                await flushPromises();

                expect(find(wrapper, "mediaPlayerMiniLive").exists()).toBe(true);
                expect(wrapper.find("[data-test='mediaPlayerMiniBack']").exists()).toBe(false);
                expect(wrapper.find("[data-test='mediaPlayerMiniForward']").exists()).toBe(false);
                expect(wrapper.find("[data-test='mediaPlayerMiniSeek']").exists()).toBe(false);
                expect(find(wrapper, "mediaPlayerMiniPlay").exists()).toBe(true);
            });
        });
    });

    describe("minimised on a wide screen", () => {
        it("keeps only the picture of a video, with no bar, and its controls only for the pointer", async () => {
            await wide(async () => {
                const wrapper = await playing();
                await find(wrapper, "mediaPlayerMinimise").trigger("click");
                await flushPromises();

                expect(find(wrapper, "mediaPlayerMiniVideo").exists()).toBe(true);
                expect(wrapper.find("[data-test='mediaPlayerBar']").exists()).toBe(false);
                expect(find(wrapper, "mediaPlayerMiniVideo").html()).toContain("group-hover:opacity-100");
                expect(wrapper.find("[data-test='mediaPlayer']").attributes("inert")).toBeUndefined();
            });
        });

        it("pauses, skips and seeks from the small video, and expands or closes it", async () => {
            await wide(async () => {
                const wrapper = await playing();
                await find(wrapper, "mediaPlayerMinimise").trigger("click");
                await flushPromises();

                await find(wrapper, "mediaPlayerMiniPlay").trigger("click");
                expect(engine.handle.pause).toHaveBeenCalled();
                await find(wrapper, "mediaPlayerMiniForward").trigger("click");
                expect(engine.handle.seek).toHaveBeenLastCalledWith(40);
                await find(wrapper, "mediaPlayerMiniBack").trigger("click");
                expect(engine.handle.seek).toHaveBeenLastCalledWith(20);

                await find(wrapper, "mediaPlayerMiniClose").trigger("click");
                await flushPromises();
                expect(mediaPlayerItem.value).toBeNull();
            });
        });

        it("expands from the expand button and from the picture", async () => {
            await wide(async () => {
                const wrapper = await playing();
                await find(wrapper, "mediaPlayerMinimise").trigger("click");
                await flushPromises();
                await find(wrapper, "mediaPlayerMiniExpand").trigger("click");
                expect(mediaPlayerView.value).toBe("expanded");

                await find(wrapper, "mediaPlayerMinimise").trigger("click");
                await flushPromises();
                await find(wrapper, "mediaPlayerMiniVideo").trigger("click");
                expect(mediaPlayerView.value).toBe("expanded");
            });
        });

        it("keeps today's bar for sound alone", async () => {
            await wide(async () => {
                const wrapper = await playing();
                await find(wrapper, "mediaPlayerAudio").trigger("click");
                await flushPromises();
                await find(wrapper, "mediaPlayerMinimise").trigger("click");
                await flushPromises();

                expect(find(wrapper, "mediaPlayerBar").exists()).toBe(true);
                expect(wrapper.find("[data-test='mediaPlayerMiniVideo']").exists()).toBe(false);
            });
        });

        it("keeps the bar on a phone, for video too", async () => {
            screenWide = false;
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await flushPromises();
            expect(find(wrapper, "mediaPlayerBar").exists()).toBe(true);
            expect(wrapper.find("[data-test='mediaPlayerMiniVideo']").exists()).toBe(false);
        });
    });

    describe("video drawn behind the page", () => {
        const hole = () => document.documentElement.classList.contains("lmc-inline-video");

        it("leaves the picture area transparent and the page behind it hidden", async () => {
            engine.inlineActive = true;
            const wrapper = await playing();
            await flushPromises();

            expect(hole()).toBe(true);
            expect(wrapper.find(".aspect-video.bg-transparent").exists()).toBe(true);
        });

        it("keeps the picture black and the page as it was where the platform cannot", async () => {
            const wrapper = await playing();

            expect(hole()).toBe(false);
            expect(wrapper.find(".aspect-video.bg-black").exists()).toBe(true);
        });

        it("gives the page back in audio mode, minimised and closed", async () => {
            engine.inlineActive = true;
            const wrapper = await playing();
            await flushPromises();
            expect(hole()).toBe(true);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(hole()).toBe(false);

            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();
            expect(hole()).toBe(true);

            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            expect(hole()).toBe(false);
        });

        it("asks the player to draw inline, and does not open full-screen for the switch", async () => {
            engine.inlineActive = true;
            const wrapper = await playing();
            expect(engine.props.inline).toBe(true);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();
            expect(engine.handle.enterFullscreen).not.toHaveBeenCalled();
        });
    });

    describe("minimised", () => {
        // The bar is a phone's; a wide screen keeps the picture in the corner instead.
        beforeEach(() => {
            screenWide = false;
        });

        it("moves down with the menu when the menu steps aside", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            const { hidden } = useMobileChromeAutoHide();
            hidden.value = true;
            await flushPromises();

            expect(find(wrapper, "mediaPlayerBar").classes().join(" ")).toContain(
                "translate-y-[calc(var(--mobile-menu-h",
            );
            hidden.value = false;
        });

        it("has a colour of its own, the player's, apart from the menu below it", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            const classes = find(wrapper, "mediaPlayerBar").classes();

            expect(classes).toContain("bg-zinc-900/70");
            expect(classes).toContain("backdrop-blur-xl");
            expect(classes).not.toContain("bg-zinc-100");
        });

        it("shows how far the item has played", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();

            expect(find(wrapper, "mediaPlayerBarProgress").attributes("style")).toContain(
                "width: 25%",
            );
        });

        it("becomes the bar, keeping the same playback", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();

            expect(mediaPlayerView.value).toBe("mini");
            expect(find(wrapper, "mediaPlayerBar").text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.find(".video-player-stub").exists()).toBe(true);
        });

        it("reopens from the bar", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await find(wrapper, "mediaPlayerBar").find("button").trigger("click");

            expect(mediaPlayerView.value).toBe("expanded");
        });

        it("pauses from the bar", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await find(wrapper, "mediaPlayerBarPlayPause").trigger("click");

            expect(engine.handle.pause).toHaveBeenCalled();
        });

        it("stops from the bar", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await find(wrapper, "mediaPlayerBarClose").trigger("click");

            expect(mediaPlayerItem.value).toBeNull();
            expect(find(wrapper, "mediaPlayerBar").exists()).toBe(false);
        });
    });

    describe("the next video in full-screen", () => {
        const doc = (id: string, extra: Record<string, unknown> = {}) => ({
            ...mockEnglishContentDto,
            _id: id,
            parentId: `${id}-parent`,
            slug: `${id}-slug`,
            title: `Title ${id}`,
            video: "https://cdn.example.com/x.m3u8",
            ...extra,
        });

        beforeEach(() => clearSwaps());

        it("offers the player the related videos when there is no next in a series", async () => {
            upNextDocs.value = [doc("rel-1"), doc("rel-2")];
            await playing();
            expect(engine.props.nextUp.map((item: { id: string }) => item.id)).toEqual([
                "rel-1",
                "rel-2",
            ]);
        });

        it("offers nothing when there is nothing to follow", async () => {
            await playing();
            expect(engine.props.nextUp).toEqual([]);
        });

        it("swaps the item, keeps the same player and the full view, and opens the page behind", async () => {
            upNextDocs.value = [doc("rel-1")];
            const wrapper = await playing();
            expect(engine.mounts).toBe(1);

            engine.emit("nextupselect", "rel-1");
            await flushPromises();

            expect(mediaPlayerItem.value?.content._id).toBe("rel-1");
            expect(mediaPlayerView.value).toBe("expanded");
            expect(engine.props.content._id).toBe("rel-1");
            expect(engine.mounts).toBe(1);
            expect(find(wrapper, "mediaPlayer").exists()).toBe(true);
            expect(routerPush).toHaveBeenCalledWith({
                name: "content",
                params: { slug: "rel-1-slug" },
            });
            // The route change that follows must not minimise the player.
            expect(isPlayerSwap("/rel-1-slug")).toBe(true);
        });

        it("ignores a pick that is not the offered video", async () => {
            upNextDocs.value = [doc("rel-1")];
            await playing();
            engine.emit("nextupselect", "other");
            await flushPromises();
            expect(mediaPlayerItem.value?.content._id).toBe(mockEnglishContentDto._id);
            expect(routerPush).not.toHaveBeenCalled();
        });
    });
});
