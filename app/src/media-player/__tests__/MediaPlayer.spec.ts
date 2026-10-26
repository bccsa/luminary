import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { rgbaToThumbHash } from "thumbhash";
import type { ContentDto } from "luminary-shared";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { subtitlePreference, userDataSaverEnabled } from "@/globalConfig";
import { isPlayerSwap, clearSwaps } from "@/util/playerSwap";
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
        ScrubPicture: defineComponent({
            name: "ScrubPicture",
            props: { cue: Object },
            setup: () => () => h("div", { "data-test": "scrubPicture" }),
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
                fullscreenTool: Boolean,
                fullscreenActive: Boolean,
                appearance: String,
                stage: String,
                fill: Boolean,
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
            setup:
                (props, { slots }) =>
                () =>
                    h("div", { "data-test": "audioFullscreenStub" }, [
                        h("div", { class: "lmpl-afs-top", "data-test": "audioFullscreenTop" }, [
                            slots["top-end"]?.(),
                        ]),
                        props.title,
                        slots["under-title"]?.(),
                        slots.sheet?.({ close: () => {} }),
                        slots["audio-tool"]?.(),
                        slots.cast?.(),
                        slots.roster?.(),
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
const currentRoute = vi.hoisted(() => ({
    value: { name: "home", params: {} as Record<string, string> },
}));
vi.mock("vue-router", () => ({
    useRouter: () => ({
        push: routerPush,
        currentRoute,
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
                windowedControls: Boolean,
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
let screenLandscape = false;
let pointerFine = false;
const setupMatchMedia = window.matchMedia;
beforeEach(() => {
    subtitlePreference.value = { on: false };
    screenWide = true;
    screenLandscape = false;
    pointerFine = false;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("1024px")
            ? screenWide
            : query.includes("landscape")
              ? screenLandscape
              : query.includes("pointer: fine")
                ? pointerFine
                : false,
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

        it("switches back to the camera that was playing", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            await find(wrapper, "mediaPlayerVideo").trigger("click");
            await flushPromises();

            expect(engine.controller.setAngle).toHaveBeenLastCalledWith("angle_0");
        });

        it("switches to the camera when it was opened on the sound alone", async () => {
            openMediaPlayer(mockEnglishContentDto, "en", { audio: true });
            const wrapper = await mountPlayer();
            expect(engine.props.startAudio).toBe(true);
            engine.state.activeAngleId = AUDIO;
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

    describe("drawing the player down", () => {
        const pointer = (y: number) => ({ clientY: y, pointerId: 1 });
        const sectionStyle = (wrapper: VueWrapper) =>
            find(wrapper, "mediaPlayer").attributes("style") ?? "";

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
        it("shows no spinner over an error", async () => {
            const wrapper = await playing();
            engine.state.playing = false;
            engine.state.duration = 0;
            engine.state.lifecycle = "error";
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerStarting']").exists()).toBe(false);
        });

        it("shows no live label for a recorded video", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerLive']").exists()).toBe(false);
        });

        it("does not scroll as a whole, so nothing dark shows where it would move", async () => {
            const wrapper = await playing();
            const section = find(wrapper, "mediaPlayer").classes();
            expect(section).toContain("overflow-hidden");
            expect(section).not.toContain("overflow-y-auto");
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
            expect(section.classes()).toEqual(
                expect.arrayContaining(["fixed", "inset-0", "z-[60]"]),
            );
            expect(section.attributes("style") ?? "").not.toContain("--media-player-top");
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

        it("with a mouse, offers the volume on a card over a mute button in the now-playing tools", () =>
            narrow(async () => {
                pointerFine = true;
                const wrapper = await playing();
                const mute = wrapper.find("[data-test='mediaPlayerVolumeMute']");
                expect(mute.exists()).toBe(true);
                expect(wrapper.find("[data-test='mediaPlayerVolume']").exists()).toBe(false);

                await mute.element.parentElement!.dispatchEvent(new Event("mouseenter"));
                await flushPromises();
                expect(wrapper.find("[data-test='mediaPlayerVolume']").exists()).toBe(true);

                await wrapper.find("[data-test='mediaPlayerVolumeUp']").trigger("click");
                expect(engine.handle.setVolume).toHaveBeenLastCalledWith(0.6);
                await wrapper.find("[data-test='mediaPlayerVolumeDown']").trigger("click");
                expect(engine.handle.setVolume).toHaveBeenLastCalledWith(0.4);
                await wrapper.find("[data-test='mediaPlayerVolumeSlider']").setValue("0.25");
                expect(engine.handle.setVolume).toHaveBeenLastCalledWith(0.25);

                await mute.trigger("click");
                expect(engine.handle.setMuted).toHaveBeenLastCalledWith(true);
            }));

        it("leaves the volume to a touch screen's own buttons", () =>
            narrow(async () => {
                const wrapper = await playing();
                expect(wrapper.find("[data-test='mediaPlayerVolumeMute']").exists()).toBe(false);
            }));
    });

    describe("AirPlay", () => {
        it("is not offered until there is a device to send to", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerAirPlay']").exists()).toBe(false);
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

        it("has no strip for the chapters: they are a tab", async () => {
            const wrapper = await playing();
            engine.state.chapters = [{ startTime: 0, endTime: 60, title: "Opening" }];
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerChapterStrip']").exists()).toBe(false);
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

        it("goes back to the page of what plays from the full player, under the title", async () => {
            screenWide = false;
            currentRoute.value = { name: "home", params: {} };
            const wrapper = await withText();
            await find(wrapper, "mediaPlayerReadArticle").trigger("click");
            expect(routerPush).toHaveBeenCalledWith({
                name: "content",
                params: { slug: "the-slug" },
            });
        });

        it("only minimises from the full player when its page is already open", async () => {
            screenWide = false;
            currentRoute.value = { name: "content", params: { slug: "the-slug" } };
            const wrapper = await withText();
            await find(wrapper, "mediaPlayerReadArticle").trigger("click");
            expect(routerPush).not.toHaveBeenCalled();
            expect(mediaPlayerView.value).toBe("mini");
            currentRoute.value = { name: "home", params: {} };
        });

        it("is a rounded card while reading a post on a phone with the menu away, and the bar on the menu otherwise", async () => {
            screenWide = false;
            currentRoute.value = { name: "content", params: { slug: "the-slug" } };
            const { hidden } = useMobileChromeAutoHide();
            try {
                openMediaPlayer(mockEnglishContentDto, "en");
                minimiseMediaPlayer();
                const reading = await mountPlayer();
                const bar = () => find(reading, "mediaPlayerBar").classes();
                hidden.value = false;
                await flushPromises();
                expect(bar()).toContain("inset-x-0");
                expect(bar()).not.toContain("rounded-[14px]");

                hidden.value = true;
                await flushPromises();
                expect(bar()).toEqual(expect.arrayContaining(["rounded-[14px]", "inset-x-2"]));
                reading.unmount();

                currentRoute.value = { name: "home", params: {} };
                const browsing = await mountPlayer();
                expect(find(browsing, "mediaPlayerBar").classes()).not.toContain("rounded-[14px]");
            } finally {
                hidden.value = false;
                currentRoute.value = { name: "home", params: {} };
            }
        });

        it("keeps the bar to the picture, the title, play and close", async () => {
            screenWide = false;
            const wrapper = await withText();
            minimiseMediaPlayer();
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerBarRead']").exists()).toBe(false);
            expect(find(wrapper, "mediaPlayerBarPlayPause").exists()).toBe(true);
            expect(find(wrapper, "mediaPlayerBarClose").exists()).toBe(true);
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

        it("keeps a playing video going on a tap of the bar, which only seeks", async () => {
            engine.thumbnailsReady = true;
            const wrapper = await playing();

            screen(wrapper).vm.$emit("scrub", { time: 50, markerX: 120, width: 390, bottom: 200 });
            screen(wrapper).vm.$emit("scrub", { time: 51, markerX: 122, width: 390, bottom: 200 });
            screen(wrapper).vm.$emit("scrub", null);
            await flushPromises();

            expect(engine.handle.pause).not.toHaveBeenCalled();
            expect(engine.handle.play).not.toHaveBeenCalled();
        });

        it("holds a playing video still while the bar is dragged, and plays on once it is let go, the frames still up", async () => {
            engine.thumbnailsReady = true;
            const wrapper = await playing();

            screen(wrapper).vm.$emit("scrub", { time: 50, markerX: 120, width: 390, bottom: 200 });
            screen(wrapper).vm.$emit("scrub", { time: 60, markerX: 160, width: 390, bottom: 200 });
            await flushPromises();
            expect(engine.handle.pause).toHaveBeenCalledTimes(1);
            expect(engine.handle.play).not.toHaveBeenCalled();

            screen(wrapper).vm.$emit("scrub", null);
            await flushPromises();
            expect(engine.handle.play).toHaveBeenCalledTimes(1);
            expect(screen(wrapper).find("[data-test='mediaPlayerNowPlayingRoster']").exists()).toBe(
                true,
            );
        });

        it("puts the frames away after five seconds of playback nobody touches", async () => {
            engine.thumbnailsReady = true;
            const wrapper = await playing();
            screen(wrapper).vm.$emit("scrub", { time: 50, markerX: 120, width: 390, bottom: 200 });
            screen(wrapper).vm.$emit("scrub", { time: 60, markerX: 160, width: 390, bottom: 200 });
            await flushPromises();
            vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
            try {
                screen(wrapper).vm.$emit("scrub", null);
                await flushPromises();
                const roster = () =>
                    screen(wrapper).find("[data-test='mediaPlayerNowPlayingRoster']").exists();
                expect(roster()).toBe(true);

                vi.advanceTimersByTime(4900);
                await flushPromises();
                expect(roster()).toBe(true);

                vi.advanceTimersByTime(200);
                await flushPromises();
                expect(roster()).toBe(false);
            } finally {
                vi.useRealTimers();
            }
        });

        it("takes one press on Play to pause with the frames up: the press does not first resume the video", async () => {
            engine.thumbnailsReady = true;
            const wrapper = await playing();
            screen(wrapper).vm.$emit("scrub", { time: 50, markerX: 120, width: 390, bottom: 200 });
            screen(wrapper).vm.$emit("scrub", { time: 60, markerX: 160, width: 390, bottom: 200 });
            await flushPromises();
            screen(wrapper).vm.$emit("scrub", null);
            await flushPromises();
            engine.handle.play.mockClear();

            document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
            screen(wrapper).vm.$emit("toggle-play");
            await flushPromises();
            expect(engine.handle.play).not.toHaveBeenCalled();
            expect(engine.handle.pause).toHaveBeenCalledTimes(2);
            expect(screen(wrapper).find("[data-test='mediaPlayerNowPlayingRoster']").exists()).toBe(
                false,
            );
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
            const after = {
                ...next,
                _id: "next-2",
                parentId: "next-2-parent",
                title: "The one after",
            };
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

        it("lets a video fill the window of a phone's browser turned sideways, with the player's own controls", async () => {
            screenLandscape = true;
            const wrapper = await playing();
            expect(screen(wrapper).props().fill).toBe(true);
            expect(wrapper.findComponent({ name: "VideoPlayer" }).props("windowedControls")).toBe(
                true,
            );

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(screen(wrapper).props().fill).toBe(false);
            expect(wrapper.findComponent({ name: "VideoPlayer" }).props("windowedControls")).toBe(
                false,
            );
        });

        it("keeps the now-playing screen upright, and in the packaged app, which turns to its own full screen", async () => {
            const upright = await playing();
            expect(screen(upright).props().fill).toBe(false);

            screenLandscape = true;
            vi.stubEnv("VITE_BUILD_TARGET", "native");
            try {
                const app = await playing();
                expect(screen(app).props().fill).toBe(false);
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it("turns the sound screen sideways from its button, and the X turns it back", async () => {
            const lockLandscape = vi.fn();
            openMediaPlayer(mockEnglishContentDto, "en");
            const wrapper = await mountPlayer({
                [PlatformChromeKey]: {
                    chromeFadeEnabled: false,
                    setStatusBarHidden: vi.fn(),
                    lockLandscape,
                },
            });
            expect(screen(wrapper).props().fullscreenTool).toBe(false);

            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(screen(wrapper).props().fullscreenTool).toBe(true);
            expect(screen(wrapper).props().fullscreenActive).toBe(false);

            screen(wrapper).vm.$emit("fullscreen");
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(true);
            expect(screen(wrapper).props().fullscreenActive).toBe(true);

            screen(wrapper).vm.$emit("fullscreen");
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(false);
            expect(screen(wrapper).props().fullscreenActive).toBe(false);
        });

        it("goes to the sound screen's full screen when the phone is turned, as a video does", async () => {
            const lockLandscape = vi.fn();
            const setPagesTurn = vi.fn();
            let turned: ((sideways: boolean) => void) | undefined;
            const onPhoneTurned = vi.fn((listener: (sideways: boolean) => void) => {
                turned = listener;
                return () => (turned = undefined);
            });
            openMediaPlayer(mockEnglishContentDto, "en");
            const wrapper = await mountPlayer({
                [PlatformChromeKey]: {
                    chromeFadeEnabled: false,
                    setStatusBarHidden: vi.fn(),
                    setPagesTurn,
                    lockLandscape,
                    onPhoneTurned,
                },
            });
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            // The pages stay upright: the turn is the screen's to take.
            expect(setPagesTurn).not.toHaveBeenCalledWith(true);

            turned!(true);
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(true);
            expect(screen(wrapper).props().fullscreenActive).toBe(true);

            // The X while still on its side: back upright, and no turn counts until the phone is upright.
            screen(wrapper).vm.$emit("fullscreen");
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(false);
            turned!(true);
            await flushPromises();
            expect(screen(wrapper).props().fullscreenActive).toBe(false);

            turned!(false);
            turned!(true);
            await flushPromises();
            expect(screen(wrapper).props().fullscreenActive).toBe(true);

            // Turned back upright: it leaves, as a video's full screen does.
            turned!(false);
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(false);
            expect(screen(wrapper).props().fullscreenActive).toBe(false);

            // Held sideways by its button, it stays so whatever the phone does: only the X lets go.
            screen(wrapper).vm.$emit("fullscreen");
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(true);
            turned!(true);
            turned!(false);
            await flushPromises();
            expect(screen(wrapper).props().fullscreenActive).toBe(true);
            screen(wrapper).vm.$emit("fullscreen");
            await flushPromises();
            expect(lockLandscape).toHaveBeenLastCalledWith(false);
            expect(screen(wrapper).props().fullscreenActive).toBe(false);

            minimiseMediaPlayer();
            await flushPromises();
            expect(turned).toBeUndefined();
        });

        it("offers no way to turn the sound screen where the platform cannot", async () => {
            openMediaPlayer(mockEnglishContentDto, "en");
            const wrapper = await mountPlayer({
                [PlatformChromeKey]: { chromeFadeEnabled: false, setStatusBarHidden: vi.fn() },
            });
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(screen(wrapper).props().fullscreenTool).toBe(false);
        });

        it("lets the pages turn with the phone while the sound screen is open, and only then", async () => {
            const setPagesTurn = vi.fn();
            openMediaPlayer(mockEnglishContentDto, "en");
            const wrapper = await mountPlayer({
                [PlatformChromeKey]: {
                    chromeFadeEnabled: false,
                    setStatusBarHidden: vi.fn(),
                    setPagesTurn,
                },
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
                expect(
                    wrapper.findComponent({ name: "VideoPlayer" }).props("captionBand"),
                ).toBeGreaterThan(0);
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
            await find(wrapper, "audioFullscreenStub").trigger("pointerdown", {
                clientY: 100,
                pointerId: 1,
            });
            await find(wrapper, "audioFullscreenStub").trigger("pointermove", {
                clientY: 200,
                pointerId: 1,
            });
            expect(sectionStyle()).not.toContain("--tw-translate-y");

            await find(wrapper, "audioFullscreenTop").trigger("pointerdown", {
                clientY: 100,
                pointerId: 1,
            });
            await find(wrapper, "audioFullscreenTop").trigger("pointermove", {
                clientY: 160,
                pointerId: 1,
            });
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

        it("opens with the subtitles on when the viewer last left them on, as the lyrics with sound alone", async () => {
            subtitlePreference.value = { on: true, lang: "fr" };
            const wrapper = await playing();
            engine.handle.subtitleCues = [
                { start: 1, end: 3, text: "Help me, Your Word to obey!" },
            ];
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(engine.controller.setSubtitleTrack).toHaveBeenLastCalledWith("sub-fr");
            expect(screen(wrapper).props().lyrics).toEqual(engine.handle.subtitleCues);
        });

        it("leaves the subtitles off for a viewer who left them off", async () => {
            await playing();
            await flushPromises();
            expect(engine.controller.setSubtitleTrack).not.toHaveBeenCalled();
        });

        it("remembers the viewer's own choice, on or off", async () => {
            await playing();
            engine.state.activeSubtitleTrackId = "sub-fr";
            await flushPromises();
            expect(subtitlePreference.value).toEqual({ on: true, lang: "fr" });
            engine.state.activeSubtitleTrackId = null;
            await flushPromises();
            expect(subtitlePreference.value).toEqual({ on: false, lang: "fr" });
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
        const press = (
            key: string,
            init: KeyboardEventInit = {},
            target: EventTarget = document.body,
        ) => {
            const event = new KeyboardEvent("keydown", {
                key,
                bubbles: true,
                cancelable: true,
                ...init,
            });
            target.dispatchEvent(event);
            return event;
        };

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

    describe("minimised on a wide screen", () => {
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

        it("stops following the picture's slot once it holds still, and follows it again when it moves", async () => {
            const frames: FrameRequestCallback[] = [];
            const raf = vi
                .spyOn(window, "requestAnimationFrame")
                .mockImplementation((cb) => frames.push(cb));
            try {
                await playing();
                minimiseMediaPlayer();
                await flushPromises();
                const runFrames = (n: number) => {
                    for (let i = 0; i < n && frames.length; i++) frames.shift()!(0);
                };
                runFrames(50);
                expect(frames).toHaveLength(0);

                window.dispatchEvent(new Event("transitionrun"));
                expect(frames.length).toBeGreaterThan(0);
                runFrames(50);
                expect(frames).toHaveLength(0);
            } finally {
                raf.mockRestore();
            }
        });

        it("is the plain dark bar, with nothing blurred, when the post has no ThumbHash", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            const bar = find(wrapper, "mediaPlayerBar");

            expect(bar.classes()).toContain("bg-zinc-900");
            expect(bar.classes().join(" ")).not.toContain("backdrop-blur");
            expect(bar.attributes("style") ?? "").not.toContain("background-color");
        });

        it("wears the post image's ThumbHash under a scrim, over its colour darkened", async () => {
            const rgba = new Uint8Array(8 * 8 * 4);
            for (let i = 0; i < 64; i++) rgba.set([240, 220, 200, 255], i * 4);
            const thumbHash = btoa(String.fromCharCode(...rgbaToThumbHash(8, 8, rgba)));
            openMediaPlayer(
                {
                    ...mockEnglishContentDto,
                    parentImageData: {
                        fileCollections: [{ aspectRatio: 1, imageFiles: [], thumbHash }],
                    },
                } as unknown as ContentDto,
                "en",
            );
            const wrapper = await mountPlayer();
            minimiseMediaPlayer();
            await flushPromises();
            const bar = find(wrapper, "mediaPlayerBar");

            expect(bar.classes()).not.toContain("bg-zinc-900");
            const [r, g, b] = (bar.attributes("style") ?? "")
                .match(/rgb\((\d+), (\d+), (\d+)\)/)!
                .slice(1)
                .map(Number);
            // A light picture still gives a bar white text reads on.
            expect(Math.max(r, g, b)).toBeLessThan(140);
            expect(r).toBeGreaterThan(b);
            // Over that colour, the ThumbHash itself, under a scrim.
            expect(bar.attributes("style")).toContain("data:image/png");
            expect(bar.attributes("style")).toContain("linear-gradient");
        });

        it("marks the way up on the picture", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            await find(wrapper, "mediaPlayerBarPicture").trigger("click");

            expect(mediaPlayerView.value).toBe("expanded");
        });

        it("shows how far the item has played", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();

            expect(find(wrapper, "mediaPlayerBarProgress").attributes("style")).toContain(
                "width: 25%",
            );
        });

        it("shows the spinner in play's place while it loads or is stuck, and play once it plays", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            expect(find(wrapper, "mediaPlayerBarPlayPause").exists()).toBe(true);
            expect(wrapper.find("[data-test='mediaPlayerBarBusy']").exists()).toBe(false);

            engine.state.lifecycle = "loading";
            await flushPromises();
            expect(find(wrapper, "mediaPlayerBarBusy").exists()).toBe(true);
            expect(wrapper.find("[data-test='mediaPlayerBarPlayPause']").exists()).toBe(false);

            engine.state.lifecycle = "ready";
            engine.state.stalled = true;
            await flushPromises();
            expect(find(wrapper, "mediaPlayerBarBusy").exists()).toBe(true);

            engine.state.stalled = false;
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerBarBusy']").exists()).toBe(false);
            expect(find(wrapper, "mediaPlayerBarPlayPause").exists()).toBe(true);
        });

        it("shows no spinner in the bar over an error", async () => {
            const wrapper = await playing();
            minimiseMediaPlayer();
            await flushPromises();
            engine.state.playing = false;
            engine.state.duration = 0;
            engine.state.lifecycle = "error";
            await flushPromises();
            expect(wrapper.find("[data-test='mediaPlayerBarBusy']").exists()).toBe(false);
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
