import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { userDataSaverEnabled } from "@/globalConfig";
import { markSeen } from "@/recommendation/seenStore";
import { useMobileChromeAutoHide } from "@/composables/useMobileChromeAutoHide";
import MediaPlayer from "../MediaPlayer.vue";
import {
    closeMediaPlayer,
    mediaPlayerItem,
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
    inlineActive: false,
    canMute: false,
    airPlayAvailable: false,
    airPlayActive: false,
}));

vi.mock("@luminary-media-converter/player-web", () => ({ AUDIO_ONLY_ANGLE_ID: "__audio__" }));

const upNextDocs = vi.hoisted(() => ({ value: [] as any[] }));
const categoryDocs = vi.hoisted(() => ({ value: [] as any[] }));
vi.mock("@/composables/useContentQuery", async () => {
    const { computed } = await import("vue");
    return {
        // The categories query is the one that asks for tag documents.
        useContentQuery: (selector: () => unknown[]) =>
            computed(() =>
                JSON.stringify(selector()).includes('"parentType"')
                    ? categoryDocs.value
                    : upNextDocs.value,
            ),
    };
});

const routerPush = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({ useRouter: () => ({ push: routerPush }) }));

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
            },
            setup(props, { expose }) {
                engine.props = props;
                engine.state = reactive({
                    lifecycle: "ready",
                    playing: true,
                    currentTime: 30,
                    duration: 120,
                    bufferedEnd: 60,
                    playbackRate: 1,
                    isAudioOnly: false,
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
                    chapters: [] as { startTime: number; endTime: number; title: string }[],
                    subtitleTracks: [
                        { id: "sub-fr", lang: "fr", label: "Français", source: "master" },
                    ],
                    activeSubtitleTrackId: null,
                });
                engine.controller = {
                    setAngle: vi.fn(async (id: string) => {
                        engine.state.activeAngleId = id;
                        engine.state.isAudioOnly = id === AUDIO;
                    }),
                    setPlaybackRate: vi.fn(),
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
                    startPictureInPicture: vi.fn(),
                    get airPlayAvailable() {
                        return engine.airPlayAvailable;
                    },
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

async function mountPlayer() {
    const wrapper = mount(MediaPlayer, { global: { stubs: { LImage: true } } });
    wrappers.push(wrapper);
    await flushPromises();
    return wrapper;
}

async function playing() {
    openMediaPlayer(mockEnglishContentDto, "en");
    return mountPlayer();
}

const find = (wrapper: VueWrapper, test: string) => wrapper.find(`[data-test='${test}']`);

beforeEach(() => {
    setActivePinia(createPinia());
    upNextDocs.value = [];
    categoryDocs.value = [];
    routerPush.mockClear();
    engine.inlineActive = false;
    engine.canMute = false;
    engine.airPlayAvailable = false;
    engine.airPlayActive = false;
    document.documentElement.classList.remove("lmc-inline-video");
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

        it("is not offered when the source has no audio-only angle", async () => {
            const wrapper = await playing();
            engine.state.angles = [{ id: "angle_0", name: "Wide", isDefault: true }];
            await flushPromises();

            expect(find(wrapper, "mediaPlayerAudio").exists()).toBe(false);
        });
    });

    describe("the transport", () => {
        it("keeps the seek bar clear of the screen edges, where a system back gesture is read", async () => {
            const wrapper = await playing();
            // 2.5rem (40px) each side: wider than the zone Android and iOS give their edge gesture.
            expect(find(wrapper, "mediaPlayerSeekBar").classes()).toContain("px-10");
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

        it("seeks where the bar is dropped", async () => {
            const wrapper = await playing();
            const bar = find(wrapper, "mediaPlayerSeek");
            (bar.element as HTMLInputElement).value = "90";
            await bar.trigger("change");

            expect(engine.handle.seek).toHaveBeenCalledWith(90);
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

        it("offers no full-screen while there is no picture", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerAudio").trigger("click");
            await flushPromises();
            expect(find(wrapper, "mediaPlayerFullscreen").exists()).toBe(false);
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
            const tabs = wrapper.find("[role=tablist]");
            expect(tabs.classes()).toContain("mt-auto");
            // The column they sit in fills the player, so "auto" is the room under the controls.
            const column = tabs.element.parentElement!;
            expect(column.className).toContain("flex-col");
            expect(column.className).toContain("flex-1");
        });

        it("does not hand its scrolling on to the page behind it", async () => {
            const wrapper = await playing();
            expect(find(wrapper, "mediaPlayer").classes()).toContain("overscroll-contain");
        });

        it("closes the menu on a tap anywhere else", async () => {
            const wrapper = await playing();
            await wrapper.find("button[aria-label='media_player.speed']").trigger("click");
            expect(wrapper.find("[data-test='mediaPlayerMenu']").exists()).toBe(true);

            await find(wrapper, "mediaPlayerMenuBackdrop").trigger("click");
            expect(wrapper.find("[data-test='mediaPlayerMenu']").exists()).toBe(false);
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

        it("offers no subtitles the source does not have", async () => {
            const wrapper = await playing();
            engine.state.subtitleTracks = [];
            await flushPromises();
            expect(find(wrapper, "mediaPlayerSubtitles").attributes("disabled")).toBeDefined();
        });

        it("offers no language menu for a single track", async () => {
            const wrapper = await playing();
            engine.state.audioTracks = [{ id: "en", lang: "en", label: "English" }];
            await flushPromises();

            expect(wrapper.find("button[aria-label='media_player.language']").exists()).toBe(false);
        });
    });

    describe("between the chrome", () => {
        afterEach(() => document.querySelector("[data-top-bar]")?.remove());

        it("starts below the open page's top bar", async () => {
            const topBar = document.createElement("div");
            topBar.setAttribute("data-top-bar", "");
            topBar.getBoundingClientRect = () => ({ height: 90 }) as DOMRect;
            document.body.appendChild(topBar);

            const wrapper = await playing();

            expect(find(wrapper, "mediaPlayer").attributes("style")).toContain(
                "--media-player-top: 90px",
            );
        });

        it("starts at the top where the page has no top bar", async () => {
            const wrapper = await playing();
            expect(find(wrapper, "mediaPlayer").attributes("style")).toContain(
                "--media-player-top: 0px",
            );
        });

        it("brings the chrome back that scrolling had put away", async () => {
            const { hidden } = useMobileChromeAutoHide();
            hidden.value = true;
            await playing();
            expect(hidden.value).toBe(false);
        });
    });

    describe("mute and picture in picture", () => {
        it("are dimmed where the platform has none", async () => {
            const wrapper = await playing();
            expect(find(wrapper, "mediaPlayerMute").attributes("disabled")).toBeDefined();
            expect(
                find(wrapper, "mediaPlayerPictureInPicture").attributes("disabled"),
            ).toBeDefined();
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

    describe("the tabs under the picture (up next, about) and the chapter strip", () => {
        const tabIds = (wrapper: VueWrapper) =>
            wrapper.findAll("[role=tab]").map((tab) => tab.attributes("data-test"));

        it("offers only about when there is nothing next and no chapters", async () => {
            const wrapper = await playing();
            expect(tabIds(wrapper)).toEqual(["mediaPlayerTab-about"]);
        });

        it("keeps chapters out of the tabs, in a strip that opens them", async () => {
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
            expect(tabIds(wrapper)).toEqual(["mediaPlayerTab-upnext", "mediaPlayerTab-about"]);

            await find(wrapper, "mediaPlayerTab-upnext").trigger("click");
            expect(find(wrapper, "mediaPlayerSheet").text()).toContain("The next one");

            await find(wrapper, "mediaPlayerChapterStrip").trigger("click");
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
            await find(wrapper, "mediaPlayerChapterStrip").trigger("click");

            await wrapper.findAll("[data-test='mediaPlayerChapter']")[1]!.trigger("click");
            expect(engine.handle.seek).toHaveBeenLastCalledWith(60);
            expect(engine.handle.play).toHaveBeenCalled();
        });

        it("shows the chapter the playhead is in on the strip, and no strip without chapters", async () => {
            const wrapper = await playing();
            expect(wrapper.find("[data-test='mediaPlayerChapterStrip']").exists()).toBe(false);
            engine.state.chapters = [
                { startTime: 0, endTime: 20, title: "Opening" },
                { startTime: 20, endTime: 120, title: "The talk" },
            ];
            await flushPromises();
            expect(find(wrapper, "mediaPlayerChapterStrip").text()).toContain("The talk");
            expect(find(wrapper, "mediaPlayerChapterStrip").text()).toContain("2/2");
        });

        it("marks the chapter the playhead is in", async () => {
            const wrapper = await playing();
            engine.state.chapters = [
                { startTime: 0, endTime: 20, title: "Opening" },
                { startTime: 20, endTime: 120, title: "The talk" },
            ];
            await flushPromises();
            await find(wrapper, "mediaPlayerChapterStrip").trigger("click");

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
            expect(tabIds(wrapper)).toEqual(["mediaPlayerTab-about"]);
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
            const next = rows("next");
            expect(next).toHaveLength(2);
            expect(next[0]).toContain("saturday");
            expect(next[1]).toContain("sunday");
            const related = rows("related").join(" ");
            expect(related).toContain("thursday");
            expect(related).toContain("other-topic");
            expect(related).not.toContain("saturday");
        });

        it("closes a tab whose content went away", async () => {
            const wrapper = await playing();
            engine.state.chapters = [{ startTime: 0, endTime: 60, title: "Opening" }];
            await flushPromises();
            await find(wrapper, "mediaPlayerChapterStrip").trigger("click");
            expect(find(wrapper, "mediaPlayerSheet").exists()).toBe(true);

            engine.state.chapters = [];
            await flushPromises();
            expect(find(wrapper, "mediaPlayerSheet").exists()).toBe(false);
        });
    });

    describe("about, and the page of what plays", () => {
        const withText = () => {
            openMediaPlayer(
                { ...mockEnglishContentDto, text: "<p>The article.</p>", slug: "the-slug" },
                "en",
            );
            return mountPlayer();
        };

        it("opens about under the player with a taste of the article, and closes it", async () => {
            const wrapper = await withText();
            expect(find(wrapper, "mediaPlayerAbout").exists()).toBe(false);

            await find(wrapper, "mediaPlayerTab-about").trigger("click");
            expect(find(wrapper, "mediaPlayerAboutText").text()).toContain("The article.");
            expect(wrapper.find(".video-player-stub").exists()).toBe(true);

            await find(wrapper, "mediaPlayerSheetClose").trigger("click");
            expect(find(wrapper, "mediaPlayerAbout").exists()).toBe(false);
        });

        it("shows the summary and the categories, and still leads to the page without an article", async () => {
            categoryDocs.value = [
                {
                    ...mockEnglishContentDto,
                    _id: "tag-1",
                    parentId: "tag-1",
                    title: "The conference",
                },
            ];
            openMediaPlayer(
                {
                    ...mockEnglishContentDto,
                    text: undefined,
                    summary: "What it is about.",
                    slug: "the-slug",
                    parentTags: ["tag-1"],
                    copyright: "© The church",
                },
                "en",
            );
            const wrapper = await mountPlayer();
            await find(wrapper, "mediaPlayerTab-about").trigger("click");

            expect(find(wrapper, "mediaPlayerAboutSummary").text()).toBe("What it is about.");
            expect(find(wrapper, "mediaPlayerAboutText").exists()).toBe(false);
            expect(find(wrapper, "mediaPlayerAboutCopyright").text()).toBe("© The church");
            await find(wrapper, "mediaPlayerRead").trigger("click");
            expect(routerPush).toHaveBeenLastCalledWith({
                name: "content",
                params: { slug: "the-slug" },
            });
        });

        it("sends the article's Read more to the page", async () => {
            const wrapper = await withText();
            await find(wrapper, "mediaPlayerTab-about").trigger("click");
            await find(wrapper, "mediaPlayerAboutMore").trigger("click");
            expect(routerPush).toHaveBeenLastCalledWith({
                name: "content",
                params: { slug: "the-slug" },
            });
        });

        it("bookmarks and unbookmarks what plays", async () => {
            const wrapper = await withText();
            await find(wrapper, "mediaPlayerTab-about").trigger("click");
            const bookmarked = () =>
                find(wrapper, "mediaPlayerBookmark").attributes("aria-pressed") === "true";
            expect(bookmarked()).toBe(false);

            await find(wrapper, "mediaPlayerBookmark").trigger("click");
            expect(bookmarked()).toBe(true);
            await find(wrapper, "mediaPlayerBookmark").trigger("click");
            expect(bookmarked()).toBe(false);
        });

        it("closes with the player: minimised, or another item", async () => {
            const wrapper = await withText();
            await find(wrapper, "mediaPlayerTab-about").trigger("click");
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            expect(find(wrapper, "mediaPlayerAbout").exists()).toBe(false);
        });

        it("goes to the page of what plays, from the sheet and from the bar", async () => {
            const wrapper = await withText();
            await find(wrapper, "mediaPlayerTab-about").trigger("click");
            await find(wrapper, "mediaPlayerRead").trigger("click");
            expect(routerPush).toHaveBeenLastCalledWith({
                name: "content",
                params: { slug: "the-slug" },
            });

            routerPush.mockClear();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            await find(wrapper, "mediaPlayerBarRead").trigger("click");
            expect(routerPush).toHaveBeenCalledWith({
                name: "content",
                params: { slug: "the-slug" },
            });
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
        it("moves down with the menu when the menu steps aside", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            const { hidden } = useMobileChromeAutoHide();
            hidden.value = true;
            await flushPromises();

            expect(find(wrapper, "mediaPlayerBar").classes().join(" ")).toContain(
                "translate-y-[calc(var(--mobile-menu-h",
            );
            hidden.value = false;
        });

        it("shows how far the item has played", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");

            expect(find(wrapper, "mediaPlayerBarProgress").attributes("style")).toContain(
                "width: 25%",
            );
        });

        it("becomes the bar, keeping the same playback", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");

            expect(mediaPlayerView.value).toBe("mini");
            expect(find(wrapper, "mediaPlayerBar").text()).toContain(mockEnglishContentDto.title);
            expect(wrapper.find(".video-player-stub").exists()).toBe(true);
        });

        it("reopens from the bar", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            await find(wrapper, "mediaPlayerBar").find("button").trigger("click");

            expect(mediaPlayerView.value).toBe("expanded");
        });

        it("pauses from the bar", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            await find(wrapper, "mediaPlayerBarPlayPause").trigger("click");

            expect(engine.handle.pause).toHaveBeenCalled();
        });

        it("stops from the bar", async () => {
            const wrapper = await playing();
            await find(wrapper, "mediaPlayerMinimise").trigger("click");
            await find(wrapper, "mediaPlayerBarClose").trigger("click");

            expect(mediaPlayerItem.value).toBeNull();
            expect(find(wrapper, "mediaPlayerBar").exists()).toBe(false);
        });
    });
});
