import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { h, nextTick } from "vue";
import AudioFullscreen from "../components/AudioFullscreen.vue";
import NowPlayingLyrics from "../components/NowPlayingLyrics.vue";
import { DEFAULT_MESSAGES } from "../messages";
import { activeLyric, cuesToLyrics, lyricText } from "../ui/lyrics";

const lyrics = [
    { start: 10, end: 14, text: "Out of the depths of my heart, Lord, I pray!" },
    { start: 14, end: 18, text: "Help me, Your Word to obey!" },
    { start: 18, end: 22, text: "Help me to love Your laws and way!" },
];

function mountView(props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
    return mount(AudioFullscreen, {
        props: {
            title: "Youth meeting",
            artwork: { src: "https://cdn.example.com/cover.jpg" },
            appearance: "dark",
            chapters: [],
            currentTime: 15,
            duration: 480,
            playing: true,
            chapterIndex: -1,
            playbackRate: 1,
            audioTracks: [{ id: "en", label: "English" }],
            activeAudioTrackId: "en",
            sleepTimer: null,
            hasBrowse: false,
            skipBackSeconds: 10,
            skipForwardSeconds: 10,
            chapterMask: "",
            messages: DEFAULT_MESSAGES,
            ...props,
        },
        slots,
        attachTo: document.body,
    });
}
const find = (wrapper: ReturnType<typeof mountView>, test: string) =>
    wrapper.find(`[data-test='${test}']`);

describe("lyrics", () => {
    it("reads a cue without its WebVTT markup", () => {
        expect(lyricText("<v Choir><i>Help me</i>, Your Word\n  to obey! </v>")).toBe(
            "Help me, Your Word\nto obey!",
        );
        expect(lyricText("Faith &amp; hope")).toBe("Faith & hope");
        expect(lyricText("<c.yellow></c>")).toBe("");
    });

    it("turns a track's cues into lines in time order, without empty or repeated ones", () => {
        const cues = [
            { startTime: 14, endTime: 18, text: "Help me, Your Word to obey!" },
            { startTime: 10, endTime: 14, text: "Out of the depths" },
            { startTime: 14, endTime: 18, text: "Help me, Your Word to obey!" },
            { startTime: 20, endTime: 21, text: "   " },
        ];
        expect(cuesToLyrics(cues).map((line) => line.start)).toEqual([10, 14]);
        expect(cuesToLyrics(null)).toEqual([]);
    });

    it("keeps the last line that has started lit, through the pause after it", () => {
        expect(activeLyric(lyrics, 5)).toBe(-1);
        expect(activeLyric(lyrics, 10)).toBe(0);
        expect(activeLyric(lyrics, 15)).toBe(1);
        expect(activeLyric(lyrics, 40)).toBe(2);
    });

    it("lights the line being sung, and goes to a line that is tapped", async () => {
        const wrapper = mount(NowPlayingLyrics, {
            props: { lines: lyrics, currentTime: 15, label: "Lyrics" },
        });
        const lines = wrapper.findAll("[data-lyric]");
        expect(lines[1]!.attributes("aria-current")).toBe("true");
        expect(lines[0]!.attributes("aria-current")).toBeUndefined();

        await lines[2]!.trigger("click");
        expect(wrapper.emitted("seek")).toEqual([[18]]);
    });

    describe("between the player's reports of the time", () => {
        beforeEach(() => {
            vi.useFakeTimers({
                toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
            });
        });
        afterEach(() => {
            vi.useRealTimers();
        });
        const lit = (wrapper: ReturnType<typeof mount>) =>
            wrapper
                .findAll("[data-lyric]")
                .findIndex((line) => line.attributes("aria-current") === "true");

        it("lights the next line on time while playing, at the playback speed", async () => {
            const wrapper = mount(NowPlayingLyrics, {
                props: {
                    lines: lyrics,
                    currentTime: 13.9,
                    label: "Lyrics",
                    playing: true,
                    rate: 1,
                },
            });
            expect(lit(wrapper)).toBe(0);
            vi.advanceTimersByTime(150);
            await nextTick();
            expect(lit(wrapper)).toBe(1);
        });

        it("waits for the player while paused, and never runs on past a stall", async () => {
            const wrapper = mount(NowPlayingLyrics, {
                props: { lines: lyrics, currentTime: 13.9, label: "Lyrics", playing: false },
            });
            vi.advanceTimersByTime(500);
            await nextTick();
            expect(lit(wrapper)).toBe(0);

            await wrapper.setProps({ playing: true, currentTime: 16.5 });
            vi.advanceTimersByTime(5000);
            await nextTick();
            // A second at most past the last report: line 1, not line 2 at 18.
            expect(lit(wrapper)).toBe(1);
        });

        it("does not step back a line for a report a moment late, and follows a seek back", async () => {
            const wrapper = mount(NowPlayingLyrics, {
                props: {
                    lines: lyrics,
                    currentTime: 13.9,
                    label: "Lyrics",
                    playing: true,
                    rate: 1,
                },
            });
            vi.advanceTimersByTime(200);
            await nextTick();
            expect(lit(wrapper)).toBe(1);
            await wrapper.setProps({ currentTime: 13.95 });
            expect(lit(wrapper)).toBe(1);
            await wrapper.setProps({ currentTime: 11 });
            expect(lit(wrapper)).toBe(0);
        });
    });
});

describe("the now-playing view for a host", () => {
    it("names the chevron as the host asks, and fills the right of the top line from its slot", () => {
        const wrapper = mountView(
            { exitLabel: "Minimise player" },
            { "top-end": () => h("button", { "data-test": "hostToggle" }) },
        );
        expect(find(wrapper, "afsExit").attributes("aria-label")).toBe("Minimise player");
        expect(find(wrapper, "afsTopEnd").find("[data-test='hostToggle']").exists()).toBe(true);

        const plain = mountView();
        expect(find(plain, "afsExit").attributes("aria-label")).toBe(
            DEFAULT_MESSAGES.exitFullscreen,
        );
        expect(find(plain, "afsTopEnd").exists()).toBe(false);
    });

    it("takes its colour from the given wash, unblurred, and from the cover without one", () => {
        const hashed = mountView({ wash: "data:image/png;base64,AAAA" });
        expect(find(hashed, "afsWash").attributes("src")).toBe("data:image/png;base64,AAAA");
        expect(find(hashed, "afsWash").classes()).toContain("lmpl-afs-wash-hash");

        const plain = mountView();
        expect(find(plain, "afsWash").attributes("src")).toBe("https://cdn.example.com/cover.jpg");
        expect(find(plain, "afsWash").classes()).not.toContain("lmpl-afs-wash-hash");
    });

    describe("with sound alone", () => {
        it("shows the line being said under the cover, and the scrolling lyrics in its place when expanded", async () => {
            const tracks = [{ id: "en", label: "English" }];
            const wrapper = mountView({
                lyrics,
                subtitleTracks: tracks,
                activeSubtitleTrackId: null,
            });
            expect(find(wrapper, "afsCueLine").exists()).toBe(false);
            await wrapper.setProps({ activeSubtitleTrackId: "en" });
            expect(find(wrapper, "afsCueLine").exists()).toBe(true);
            expect(find(wrapper, "afsCover").exists()).toBe(true);
            expect(find(wrapper, "afsLyrics").exists()).toBe(false);

            await find(wrapper, "afsLyricsExpand").trigger("click");
            expect(find(wrapper, "afsLyrics").exists()).toBe(true);
            expect(find(wrapper, "afsCover").exists()).toBe(false);

            await find(wrapper, "afsLyrics").findAll("[data-lyric]")[0]!.trigger("click");
            expect(wrapper.emitted("seek")).toEqual([[10]]);
        });

        it("puts the lyrics in the cover's place on a phone on its side", async () => {
            const width = vi
                .spyOn(HTMLElement.prototype, "clientWidth", "get")
                .mockReturnValue(844);
            const height = vi
                .spyOn(HTMLElement.prototype, "clientHeight", "get")
                .mockReturnValue(390);
            try {
                const wrapper = mountView({
                    lyrics,
                    subtitleTracks: [{ id: "en", label: "English" }],
                    activeSubtitleTrackId: "en",
                });
                await find(wrapper, "afsLyricsExpand").trigger("click");
                expect(find(wrapper, "afsStage").find("[data-test='afsLyrics']").exists()).toBe(
                    true,
                );
                expect(wrapper.find("[data-test='afsSideLyrics']").exists()).toBe(false);
            } finally {
                width.mockRestore();
                height.mockRestore();
            }
        });

        it("offers off and each language the post has in one menu, and shows the one chosen", async () => {
            const tracks = [
                { id: "en", label: "English" },
                { id: "fr", label: "Français" },
            ];
            const wrapper = mountView({
                lyrics,
                subtitleTracks: tracks,
                activeSubtitleTrackId: "en",
            });
            await find(wrapper, "afsLyricsLanguage").trigger("click");
            const items = wrapper.findAll('[role="menuitemradio"]');
            expect(items.map((item) => item.text())).toEqual([
                DEFAULT_MESSAGES.subtitlesOff,
                "English",
                "Français",
            ]);
            await items[2]!.trigger("click");
            expect(wrapper.emitted("subtitle-track")).toEqual([["fr"]]);

            // The French words on their way: the line waits for them.
            await wrapper.setProps({ lyrics: [], activeSubtitleTrackId: "fr" });
            expect(find(wrapper, "afsCueLine").exists()).toBe(false);
            await wrapper.setProps({ lyrics });
            expect(find(wrapper, "afsCueLine").exists()).toBe(true);
        });

        it("turns the lyrics off from the same menu", async () => {
            const wrapper = mountView({
                lyrics,
                subtitleTracks: [{ id: "en", label: "English" }],
                activeSubtitleTrackId: "en",
            });
            await find(wrapper, "afsLyricsLanguage").trigger("click");
            await find(wrapper, "afsLyricsOff").trigger("click");
            expect(wrapper.emitted("subtitle-track")).toEqual([[null]]);
        });

        it("turns its play button while the player gets ready, and still takes a press", async () => {
            const wrapper = mountView({ busy: true });
            const play = find(wrapper, "afsPlay");
            expect(play.find("[data-test='afsSpinner']").exists()).toBe(true);
            expect(play.attributes("aria-label")).toBe("Loading");
            expect(play.attributes("aria-busy")).toBe("true");
            await play.trigger("click");
            expect(wrapper.emitted("toggle-play")).toHaveLength(1);

            await wrapper.setProps({ busy: false });
            expect(play.find("[data-test='afsSpinner']").exists()).toBe(false);
            expect(play.attributes("aria-busy")).toBeUndefined();
        });

        it("draws play and pause with the player's own icons, as full screen does", async () => {
            const wrapper = mountView({ playing: false });
            const play = find(wrapper, "afsPlay");
            expect(play.find("[data-test='afsPlayIcon']").attributes("name")).toBe("play");

            await wrapper.setProps({ playing: true });
            expect(play.find("[data-test='afsPauseIcon']").attributes("name")).toBe("pause");
        });

        it("has no lyrics button for a post without words, and keeps the sleep timer", () => {
            const wrapper = mountView();
            expect(find(wrapper, "afsLyricsLanguage").exists()).toBe(false);
            expect(find(wrapper, "afsSleep").exists()).toBe(true);
            expect(find(wrapper, "afsSubtitles").exists()).toBe(false);
            expect(find(wrapper, "afsFullscreen").exists()).toBe(false);
        });

        it("offers full screen among the tools when the host has one to take the sound to", async () => {
            const wrapper = mountView({ fullscreenTool: true });
            await find(wrapper, "afsFullscreen").trigger("click");
            expect(wrapper.emitted("fullscreen")).toHaveLength(1);
            expect(find(wrapper, "afsSleep").exists()).toBe(true);
        });

        it("leaves the host full screen by an X at the top once it is open, in the tool's place", async () => {
            const wrapper = mountView({ fullscreenTool: true, fullscreenActive: true });
            expect(find(wrapper, "afsFullscreen").exists()).toBe(false);
            const close = find(wrapper, "afsCloseFullscreen");
            expect(close.attributes("aria-label")).toBe("Exit full screen");
            expect(close.find("media-icon").attributes("name")).toBe("close");
            await close.trigger("click");
            expect(wrapper.emitted("fullscreen")).toHaveLength(1);
        });
    });

    describe("the host's way on, under the title", () => {
        it("shows what the host puts under the title, and nothing without it", () => {
            const withLink = mountView(
                {},
                { "under-title": () => h("button", { "data-test": "hostLink" }, "Read") },
            );
            expect(
                withLink.find(".lmpl-afs-undertitle").find("[data-test='hostLink']").exists(),
            ).toBe(true);
            expect(mountView().find(".lmpl-afs-undertitle").exists()).toBe(false);
        });
    });

    describe("filling the window", () => {
        it("lets the picture take the whole screen with the picture, and keeps the screen as it is with the sound", () => {
            const video = mountView({ stage: "video", fill: true }, { stage: () => h("div") });
            expect(video.find(".lmpl-afs").classes()).toContain("lmpl-afs-fill");
            const sound = mountView({ fill: true });
            expect(sound.find(".lmpl-afs").classes()).not.toContain("lmpl-afs-fill");
        });
    });

    describe("with the picture", () => {
        const video = {
            stage: "video",
            subtitleTracks: [{ id: "fr", label: "Français" }],
            canPictureInPicture: true,
            lyrics,
        };

        it("puts the host's picture in the cover's place, with a full-screen button on it", async () => {
            const wrapper = mountView(video, {
                stage: () => h("div", { "data-test": "hostPicture" }),
            });
            expect(find(wrapper, "afsStage").find("[data-test='hostPicture']").exists()).toBe(true);
            expect(find(wrapper, "afsCover").exists()).toBe(false);
            expect(wrapper.find(".lmpl-afs").classes()).toContain("lmpl-afs-video");

            await find(wrapper, "afsFullscreen").trigger("click");
            expect(wrapper.emitted("fullscreen")).toHaveLength(1);
        });

        it("has a video's tools: subtitles and picture in picture, without the sleep timer or lyrics", async () => {
            const wrapper = mountView(video);
            expect(find(wrapper, "afsSleep").exists()).toBe(false);
            expect(find(wrapper, "afsLyricsLanguage").exists()).toBe(false);

            await find(wrapper, "afsSubtitles").trigger("click");
            await wrapper
                .findAll("[role=menuitemradio]")
                .find((item) => item.text() === "Français")!
                .trigger("click");
            await find(wrapper, "afsSubtitles").trigger("click");
            await find(wrapper, "afsSubtitlesOff").trigger("click");
            expect(wrapper.emitted("subtitle-track")).toEqual([["fr"], [null]]);

            await find(wrapper, "afsPictureInPicture").trigger("click");
            expect(wrapper.emitted("picture-in-picture")).toHaveLength(1);
        });

        it("puts picture in picture and full screen on the right of the line above the seek bar, not among the tools", () => {
            const wrapper = mountView({ stage: "video", canPictureInPicture: true });
            const group = find(wrapper, "afsPictureTools");
            expect(group.find("[data-test='afsPictureInPicture']").exists()).toBe(true);
            expect(group.find("[data-test='afsFullscreen']").exists()).toBe(true);
            expect(wrapper.find('[data-afs-tools] [data-test="afsFullscreen"]').exists()).toBe(
                false,
            );
        });

        it("keeps the host's player mounted with sound alone, only hidden, so switching never stops it", async () => {
            const wrapper = mountView(
                { stage: "cover" },
                { stage: () => h("div", { "data-test": "hostPicture" }) },
            );
            const slot = find(wrapper, "afsStageSlot");
            expect(slot.find("[data-test='hostPicture']").exists()).toBe(true);
            expect(slot.isVisible()).toBe(false);
            expect(find(wrapper, "afsCover").exists()).toBe(true);

            await wrapper.setProps({ stage: "video" });
            expect(find(wrapper, "afsStageSlot").isVisible()).toBe(true);
            expect(find(wrapper, "afsCover").exists()).toBe(false);
        });

        it("puts the lyrics away while the picture shows", async () => {
            const wrapper = mountView({
                lyrics,
                subtitleTracks: [{ id: "en", label: "English" }],
                activeSubtitleTrackId: "en",
            });
            await find(wrapper, "afsLyricsExpand").trigger("click");
            expect(find(wrapper, "afsLyrics").exists()).toBe(true);
            await wrapper.setProps({ stage: "video" });
            expect(find(wrapper, "afsLyrics").exists()).toBe(false);
        });

        it("says when its stage moves, so a picture drawn behind the page is placed again", async () => {
            const tops = [100, 100, 140];
            let call = 0;
            const original = HTMLElement.prototype.getBoundingClientRect;
            HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
                const top =
                    this.dataset.test === "afsStage"
                        ? (tops[Math.min(call++, tops.length - 1)] ?? 0)
                        : 0;
                return {
                    top,
                    bottom: top,
                    left: 0,
                    right: 0,
                    width: 0,
                    height: 0,
                    x: 0,
                    y: top,
                    toJSON: () => ({}),
                } as DOMRect;
            };
            try {
                const wrapper = mountView({ ...video, stageHole: true, stage: "cover" });
                await wrapper.setProps({ stage: "video" });
                await nextTick();
                const first = wrapper.emitted("stagechange")?.length ?? 0;
                expect(first).toBeGreaterThan(0);
                await wrapper.setProps({ stageHole: false });
                await wrapper.setProps({ stageHole: true });
                await nextTick();
                expect(wrapper.emitted("stagechange")!.length).toBeGreaterThan(first);
            } finally {
                HTMLElement.prototype.getBoundingClientRect = original;
            }
        });

        it("cuts the hole to the stage's exact foot, not a whole pixel short of it", async () => {
            // A Pixel 9: the stage is 231.42 px tall, which offsetHeight reads as 231.
            const original = HTMLElement.prototype.getBoundingClientRect;
            HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
                const stage = this.dataset.test === "afsStage";
                const top = stage ? 185.43 : 0;
                const height = stage ? 231.42 : 0;
                return {
                    top,
                    bottom: top + height,
                    left: 0,
                    right: 0,
                    width: 0,
                    height,
                    x: 0,
                    y: top,
                    toJSON: () => ({}),
                } as DOMRect;
            };
            try {
                const wrapper = mountView({ ...video, stageHole: true, stage: "cover" });
                await wrapper.setProps({ stage: "video" });
                await nextTick();
                await nextTick();
                const style = wrapper.find(".lmpl-afs").attributes("style") ?? "";
                const bottom = Number(/--lmpl-hole-bottom:\s*([\d.]+)px/.exec(style)?.[1]);
                expect(bottom).toBeCloseTo(185.43 + 231.42, 6);
            } finally {
                HTMLElement.prototype.getBoundingClientRect = original;
            }
        });

        it("leaves its stage clear for a picture drawn behind the page", () => {
            const wrapper = mountView({ ...video, stageHole: true });
            const root = wrapper.find(".lmpl-afs");
            expect(root.classes()).toContain("lmpl-afs-hole");
            expect(root.attributes("style")).toContain("--lmpl-hole-top");
            expect(root.attributes("style")).toContain("--lmpl-hole-bottom");
            expect(mountView({ stageHole: true }).find(".lmpl-afs").classes()).not.toContain(
                "lmpl-afs-hole",
            );
        });
    });
});
