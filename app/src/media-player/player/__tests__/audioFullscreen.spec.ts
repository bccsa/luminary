import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AudioFullscreen from "../components/AudioFullscreen.vue";
import { DEFAULT_MESSAGES } from "../messages";

const chapters = Array.from({ length: 8 }, (_, i) => ({
    startTime: i * 60,
    endTime: i * 60 + 60,
    title: `Chapter ${i + 1}`,
}));

function mountScreen(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
    return mount(AudioFullscreen, {
        props: {
            title: "Why we get thirsty",
            subtitle: "Pastor Daniel",
            eyebrow: "Sunday messages",
            artwork: { src: "https://cdn.example.com/cover.jpg" },
            appearance: "dark",
            chapters,
            currentTime: 150,
            duration: 480,
            bufferedEnd: 200,
            playing: false,
            chapterIndex: 2,
            playbackRate: 1,
            audioTracks: [{ id: "en", label: "English" }],
            activeAudioTrackId: "en",
            sleepTimer: null,
            hasBrowse: true,
            skipBackSeconds: 10,
            skipForwardSeconds: 10,
            chapterMask: "",
            messages: DEFAULT_MESSAGES,
            ...props,
        },
        global: {
            config: {
                compilerOptions: { isCustomElement: (tag: string) => tag.startsWith("media-") },
            },
        },
        slots,
        attachTo: document.body,
    });
}
const find = (wrapper: ReturnType<typeof mountScreen>, test: string) =>
    wrapper.find(`[data-test='${test}']`);

describe("AudioFullscreen — what it shows", () => {
    it("names what is playing: the title, who it is by, and the series", () => {
        const wrapper = mountScreen();
        expect(find(wrapper, "afsTitle").text()).toBe("Why we get thirsty");
        expect(wrapper.text()).toContain("Pastor Daniel");
        expect(wrapper.text()).toContain("Sunday messages");
    });

    it("shows the fallback in place of a cover that does not load, and the placeholder when there is none", async () => {
        const wrapper = mountScreen({
            artwork: { src: "https://cdn.example.com/broken.jpg", fallback: "/fallback.jpg" },
        });
        await find(wrapper, "afsCover").trigger("error");
        expect(find(wrapper, "afsCover").attributes("src")).toBe("/fallback.jpg");

        const bare = mountScreen({ artwork: { src: "https://cdn.example.com/broken.jpg" } });
        await find(bare, "afsCover").trigger("error");
        expect(find(bare, "afsCover").exists()).toBe(false);
        expect(bare.find(".lmpl-afs-cover-empty").exists()).toBe(true);
    });

    it("leads with the cover, and with a placeholder when there is none", () => {
        expect(find(mountScreen(), "afsCover").attributes("src")).toBe(
            "https://cdn.example.com/cover.jpg",
        );
        const bare = mountScreen({ artwork: null });
        expect(find(bare, "afsCover").exists()).toBe(false);
        expect(bare.find(".lmpl-afs-cover-empty").exists()).toBe(true);
    });

    it("names the chapter the playhead is in, among the others, under what plays", () => {
        const wrapper = mountScreen();
        expect(find(wrapper, "afsChapterChip").text()).toBe("Chapter 3 of 8 · Chapter 3");
        expect(
            find(mountScreen({ chapters: [], chapterIndex: -1 }), "afsChapterChip").exists(),
        ).toBe(false);
    });

    it("has no chapters or up next button without either", () => {
        const wrapper = mountScreen({ chapters: [], chapterIndex: -1, hasBrowse: false });
        expect(find(wrapper, "afsBrowse").exists()).toBe(false);
    });

    it("opens the chapters from their own button, as rows like up next, marking the playing one", async () => {
        const wrapper = mountScreen({ chaptersSheet: true });
        await find(wrapper, "afsBrowse").trigger("click");
        const rows = wrapper.findAll(".lmpl-chapter");
        expect(rows).toHaveLength(chapters.length);
        expect(rows[0]!.find(".lmpl-upnext-title").text()).toBe("Chapter 1");
        expect(wrapper.find(".lmpl-chapter[aria-current=true] .lmpl-upnext-title").text()).toBe(
            "Chapter 3",
        );
    });

    it("wears the cover as a colour over the whole screen, in light and in dark", () => {
        const light = mountScreen({ appearance: "light" });
        expect(light.find(".lmpl-afs-wash").exists()).toBe(true);
        expect(light.classes()).toContain("lmpl-afs-light");
        const dark = mountScreen({ appearance: "dark" });
        expect(dark.find(".lmpl-afs-wash").exists()).toBe(true);
        expect(dark.classes()).not.toContain("lmpl-afs-light");
    });

    it("offers the language menu only when there is more than one language", () => {
        expect(find(mountScreen(), "afsLanguage").exists()).toBe(false);
        const two = mountScreen({
            audioTracks: [
                { id: "en", label: "English" },
                { id: "fr", label: "Français" },
            ],
        });
        expect(find(two, "afsLanguage").exists()).toBe(true);
    });

    it("has no skip button when skipping is switched off", () => {
        const wrapper = mountScreen({ skipBackSeconds: 0, skipForwardSeconds: 0 });
        expect(find(wrapper, "afsSkipBack").exists()).toBe(false);
        expect(find(wrapper, "afsSkipForward").exists()).toBe(false);
    });

    it("has no way to the chapters panel when there is nothing to browse", () => {
        const wrapper = mountScreen({ hasBrowse: false });
        expect(find(wrapper, "afsBrowse").exists()).toBe(false);
    });
});

describe("AudioFullscreen — the transport", () => {
    it("reads every time in hours once the video is an hour long, and keeps the labels the same width", () => {
        // Each label switching shape on its own as it crossed an hour moved the bar between them.
        const early = mountScreen({ currentTime: 2423, duration: 6150 });
        expect(find(early, "afsElapsed").text()).toBe("0:40:23");
        expect(find(early, "afsRemaining").text()).toBe("-1:02:07");

        const late = mountScreen({ currentTime: 3700, duration: 6150 });
        expect(find(late, "afsElapsed").text()).toBe("1:01:40");
        expect(find(late, "afsRemaining").text()).toBe("-0:40:50");

        const width = (wrapper: ReturnType<typeof mountScreen>, id: string) =>
            find(wrapper, id).attributes("style");
        expect(width(early, "afsElapsed")).toBe(width(late, "afsElapsed"));
        expect(width(early, "afsElapsed")).toBe(width(early, "afsRemaining"));
    });

    it("shows the time played and left, and the fill of the bar", () => {
        const wrapper = mountScreen();
        expect(find(wrapper, "afsElapsed").text()).toBe("2:30");
        expect(find(wrapper, "afsRemaining").text()).toBe("-5:30");
        expect(find(wrapper, "afsBar").attributes("aria-valuenow")).toBe("150");
        expect(wrapper.find(".lmpl-afs-bar-fill").attributes("style")).toContain("31.25%");
    });

    it("asks to play and to pause from the one button", async () => {
        const wrapper = mountScreen();
        expect(find(wrapper, "afsPlay").attributes("aria-label")).toBe("Play");
        await find(wrapper, "afsPlay").trigger("click");
        expect(wrapper.emitted("toggle-play")).toHaveLength(1);
        await wrapper.setProps({ playing: true });
        expect(find(wrapper, "afsPlay").attributes("aria-label")).toBe("Pause");
    });

    it("skips back and forward from where the bar shows, within the length, so presses in a row add up", async () => {
        const wrapper = mountScreen({ currentTime: 5 });
        await find(wrapper, "afsSkipBack").trigger("click");
        await find(wrapper, "afsSkipForward").trigger("click");
        await find(wrapper, "afsSkipForward").trigger("click");
        expect(wrapper.emitted("seek")).toEqual([
            [0, { exact: false }],
            [10, { exact: false }],
            [20, { exact: false }],
        ]);
    });

    it("seeks with the arrow keys, five seconds at a time", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsBar").trigger("keydown", { key: "ArrowRight" });
        await find(wrapper, "afsBar").trigger("keydown", { key: "ArrowLeft" });
        expect(wrapper.emitted("seek")).toEqual([[155], [150]]);
    });

    it("follows the finger along the bar, and asks for the seek once, when it is let go", async () => {
        const wrapper = mountScreen();
        const bar = find(wrapper, "afsBar");
        bar.element.getBoundingClientRect = () => ({
            left: 100,
            width: 200,
            top: 0,
            height: 30,
            right: 300,
            bottom: 30,
            x: 100,
            y: 0,
            toJSON: () => ({}),
        });
        await bar.trigger("pointerdown", { clientX: 200, pointerId: 1 });
        await bar.trigger("pointermove", { clientX: 250, pointerId: 1 });
        expect(find(wrapper, "afsElapsed").text()).toBe("6:00");
        expect(wrapper.emitted("seek")).toBeUndefined();
        await bar.trigger("pointerup", { pointerId: 1 });
        expect(wrapper.emitted("seek")).toEqual([[360]]);
        // Held where it was let go while the player catches up, rather than flicking back to 2:30.
        expect(find(wrapper, "afsElapsed").text()).toBe("6:00");
        await wrapper.setProps({ currentTime: 359.5 });
        await wrapper.setProps({ currentTime: 362 });
        expect(find(wrapper, "afsElapsed").text()).toBe("6:02");
    });

    it("opens for scrubbing on a finger tap instead of seeking, and the sound plays on", async () => {
        const wrapper = mountScreen();
        await wrapper.setProps({ playing: true });
        const bar = find(wrapper, "afsBar");
        bar.element.getBoundingClientRect = () => ({
            left: 100,
            width: 200,
            top: 0,
            height: 30,
            right: 300,
            bottom: 30,
            x: 100,
            y: 0,
            toJSON: () => ({}),
        });
        await bar.trigger("pointerdown", { clientX: 250, pointerId: 2, pointerType: "touch" });
        await bar.trigger("pointerup", { clientX: 250, pointerId: 2, pointerType: "touch" });
        expect(wrapper.emitted("seek")).toBeUndefined();
        expect(wrapper.emitted("toggle-play")).toBeUndefined();
        expect(bar.classes()).toContain("lmpl-afs-bar-open");
    });

    it("with frames, a finger tap shows the host its strip instead of thickening the bar", async () => {
        const wrapper = mountScreen();
        await wrapper.setProps({
            thumbnailAt: (() => ({ url: "sheet.jpg", x: 0, y: 0, w: 160, h: 90 })) as never,
        });
        const bar = find(wrapper, "afsBar");
        bar.element.getBoundingClientRect = () => ({
            left: 100,
            width: 200,
            top: 0,
            height: 30,
            right: 300,
            bottom: 30,
            x: 100,
            y: 0,
            toJSON: () => ({}),
        });
        await bar.trigger("pointerdown", { clientX: 250, pointerId: 4, pointerType: "touch" });
        await bar.trigger("pointerup", { clientX: 250, pointerId: 4, pointerType: "touch" });
        expect(wrapper.emitted("seek")).toBeUndefined();
        const scrubs = wrapper.emitted("scrub") ?? [];
        expect(scrubs.at(-1)?.[0]).toMatchObject({ held: true });
        expect(bar.classes()).not.toContain("lmpl-afs-bar-open");
    });

    it("stays open while a finger is on the host strip, and closes five seconds after it lifts", async () => {
        vi.useFakeTimers();
        try {
            const wrapper = mountScreen({}, { roster: '<div data-test="hostStrip"></div>' });
            await wrapper.setProps({
                thumbnailAt: (() => ({ url: "sheet.jpg", x: 0, y: 0, w: 160, h: 90 })) as never,
            });
            const bar = find(wrapper, "afsBar");
            bar.element.getBoundingClientRect = () => ({
                left: 100,
                width: 200,
                top: 0,
                height: 30,
                right: 300,
                bottom: 30,
                x: 100,
                y: 0,
                toJSON: () => ({}),
            });
            await bar.trigger("pointerdown", { clientX: 250, pointerId: 5, pointerType: "touch" });
            await bar.trigger("pointerup", { clientX: 250, pointerId: 5, pointerType: "touch" });
            const strip = wrapper.find('[data-test="hostStrip"]');
            await strip.trigger("pointerdown", { pointerId: 6, pointerType: "touch" });
            vi.advanceTimersByTime(10000);
            expect(wrapper.emitted("scrub")?.at(-1)?.[0]).not.toBeNull();
            await strip.trigger("pointerup", { pointerId: 6, pointerType: "touch" });
            vi.advanceTimersByTime(5000);
            expect(wrapper.emitted("scrub")?.at(-1)?.[0]).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it("seeks once when a finger drags the bar and lets go", async () => {
        const wrapper = mountScreen();
        const bar = find(wrapper, "afsBar");
        bar.element.getBoundingClientRect = () => ({
            left: 100,
            width: 200,
            top: 0,
            height: 30,
            right: 300,
            bottom: 30,
            x: 100,
            y: 0,
            toJSON: () => ({}),
        });
        await bar.trigger("pointerdown", { clientX: 200, pointerId: 3, pointerType: "touch" });
        await bar.trigger("pointermove", { clientX: 250, pointerId: 3, pointerType: "touch" });
        expect(wrapper.emitted("seek")).toBeUndefined();
        await bar.trigger("pointerup", { clientX: 250, pointerId: 3, pointerType: "touch" });
        expect(wrapper.emitted("seek")).toEqual([[360]]);
    });

    describe("with frames, a finger's drag on the bar", () => {
        const withFrames = async () => {
            const wrapper = mountScreen();
            await wrapper.setProps({
                thumbnailAt: (() => ({ url: "sheet.jpg", x: 0, y: 0, w: 160, h: 90 })) as never,
            });
            const bar = find(wrapper, "afsBar");
            bar.element.getBoundingClientRect = () => ({
                left: 100,
                width: 200,
                top: 0,
                height: 30,
                right: 300,
                bottom: 30,
                x: 100,
                y: 0,
                toJSON: () => ({}),
            });
            return { wrapper, bar };
        };
        const scrubs = (wrapper: ReturnType<typeof mountScreen>) =>
            (wrapper.emitted("scrub") ?? []).map(
                ([position]) => position as { time: number; held?: boolean } | null,
            );

        it("asks only for the dragged frame, never the strip, and leaves no strip when it lets go", async () => {
            const { wrapper, bar } = await withFrames();
            await bar.trigger("pointerdown", { clientX: 200, pointerId: 7, pointerType: "touch" });
            await bar.trigger("pointermove", { clientX: 250, pointerId: 7, pointerType: "touch" });
            await bar.trigger("pointermove", { clientX: 260, pointerId: 7, pointerType: "touch" });
            expect(scrubs(wrapper).map((position) => position?.time)).toEqual([360, 384]);
            expect(scrubs(wrapper).some((position) => position?.held)).toBe(false);

            await bar.trigger("pointerup", { clientX: 260, pointerId: 7, pointerType: "touch" });
            expect(wrapper.emitted("seek")).toEqual([[384]]);
            expect(scrubs(wrapper).at(-1)).toBeNull();
            expect(scrubs(wrapper).some((position) => position?.held)).toBe(false);

            // A tap afterwards still opens the strip.
            await bar.trigger("pointerdown", { clientX: 250, pointerId: 8, pointerType: "touch" });
            await bar.trigger("pointerup", { clientX: 250, pointerId: 8, pointerType: "touch" });
            expect(scrubs(wrapper).at(-1)).toMatchObject({ held: true });
        });

        it("with a mouse, a click seeks and opens the strip there; a drag opens none", async () => {
            const { wrapper, bar } = await withFrames();
            await bar.trigger("pointerdown", { clientX: 250, pointerId: 11, pointerType: "mouse" });
            await bar.trigger("pointerup", { clientX: 250, pointerId: 11, pointerType: "mouse" });
            expect(wrapper.emitted("seek")).toEqual([[360]]);
            expect(scrubs(wrapper).at(-1)).toMatchObject({ time: 360, held: true });

            await bar.trigger("pointerdown", { clientX: 200, pointerId: 12, pointerType: "mouse" });
            await bar.trigger("pointermove", { clientX: 260, pointerId: 12, pointerType: "mouse" });
            await bar.trigger("pointerup", { clientX: 260, pointerId: 12, pointerType: "mouse" });
            expect(wrapper.emitted("seek")?.at(-1)).toEqual([384]);
            expect(scrubs(wrapper).at(-1)).toBeNull();
        });

        it("closes a strip a tap opened for the drag", async () => {
            const { wrapper, bar } = await withFrames();
            await bar.trigger("pointerdown", { clientX: 250, pointerId: 9, pointerType: "touch" });
            await bar.trigger("pointerup", { clientX: 250, pointerId: 9, pointerType: "touch" });
            expect(scrubs(wrapper).at(-1)).toMatchObject({ held: true });
            const before = scrubs(wrapper).length;

            await bar.trigger("pointerdown", { clientX: 250, pointerId: 10, pointerType: "touch" });
            await bar.trigger("pointermove", { clientX: 200, pointerId: 10, pointerType: "touch" });
            const during = scrubs(wrapper).slice(before);
            expect(during[0]).toBeNull();
            expect(during.slice(1)).toEqual([expect.objectContaining({ time: 240 })]);
            expect(during.slice(1)[0]).not.toHaveProperty("held");

            await bar.trigger("pointerup", { clientX: 200, pointerId: 10, pointerType: "touch" });
            expect(wrapper.emitted("seek")).toEqual([[240]]);
            expect(scrubs(wrapper).at(-1)).toBeNull();
        });
    });

    it("a finger drag pauses and plays explicitly, never by toggling", async () => {
        // `playing` still reads true at the release, as it can before the pause event arrives.
        const wrapper = mountScreen({ playing: true });
        const bar = find(wrapper, "afsBar");
        bar.element.getBoundingClientRect = () => ({
            left: 100,
            width: 200,
            top: 0,
            height: 30,
            right: 300,
            bottom: 30,
            x: 100,
            y: 0,
            toJSON: () => ({}),
        });
        await bar.trigger("pointerdown", { clientX: 200, pointerId: 4, pointerType: "touch" });
        await bar.trigger("pointermove", { clientX: 250, pointerId: 4, pointerType: "touch" });
        expect(wrapper.emitted("pause")).toHaveLength(1);
        await bar.trigger("pointerup", { clientX: 250, pointerId: 4, pointerType: "touch" });
        expect(wrapper.emitted("seek")).toEqual([[360]]);
        expect(wrapper.emitted("play")).toHaveLength(1);
        expect(wrapper.emitted("toggle-play")).toBeUndefined();
    });

    it("a finger drag on a paused video leaves it paused", async () => {
        const wrapper = mountScreen({ playing: false });
        const bar = find(wrapper, "afsBar");
        bar.element.getBoundingClientRect = () => ({
            left: 100,
            width: 200,
            top: 0,
            height: 30,
            right: 300,
            bottom: 30,
            x: 100,
            y: 0,
            toJSON: () => ({}),
        });
        await bar.trigger("pointerdown", { clientX: 200, pointerId: 5, pointerType: "touch" });
        await bar.trigger("pointermove", { clientX: 150, pointerId: 5, pointerType: "touch" });
        await bar.trigger("pointerup", { clientX: 150, pointerId: 5, pointerType: "touch" });
        expect(wrapper.emitted("pause")).toBeUndefined();
        expect(wrapper.emitted("play")).toBeUndefined();
        expect(wrapper.emitted("toggle-play")).toBeUndefined();
    });

    it("lets go of a seek the player never makes, after a moment", async () => {
        vi.useFakeTimers();
        try {
            const wrapper = mountScreen();
            await find(wrapper, "afsSkipForward").trigger("click");
            expect(find(wrapper, "afsElapsed").text()).toBe("2:40");
            vi.advanceTimersByTime(2000);
            await wrapper.vm.$nextTick();
            expect(find(wrapper, "afsElapsed").text()).toBe("2:30");
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("AudioFullscreen — a live stream", () => {
    it("has no skip buttons and says Live where the time left would be", () => {
        const wrapper = mountScreen({ duration: Infinity });
        expect(find(wrapper, "afsSkipBack").exists()).toBe(false);
        expect(find(wrapper, "afsSkipForward").exists()).toBe(false);
        expect(find(wrapper, "afsRemaining").exists()).toBe(false);
        expect(find(wrapper, "afsLive").text()).toBe("Live");
    });

    it("does the same when told it is live, whatever the length says", () => {
        const wrapper = mountScreen({ live: true });
        expect(find(wrapper, "afsLive").exists()).toBe(true);
        expect(find(wrapper, "afsSkipBack").exists()).toBe(false);
    });
});

describe("AudioFullscreen — what it asks for", () => {
    it("asks to leave fullscreen, and the host to open the chapters, from the button", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsExit").trigger("click");
        await find(wrapper, "afsBrowse").trigger("click");
        expect(wrapper.emitted("exit")).toHaveLength(1);
        expect(wrapper.emitted("open-browse")).toHaveLength(1);
    });

    it("asks to go to the chapter that is chosen", async () => {
        const wrapper = mountScreen({ chaptersSheet: true });
        await find(wrapper, "afsBrowse").trigger("click");
        await wrapper.findAll(".lmpl-chapter")[3]!.trigger("click");
        expect(wrapper.emitted("seek-chapter")![0]).toEqual([chapters[3]]);
    });

    it("opens the speed menu, asks for a speed, and closes", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsSpeed").trigger("click");
        const items = wrapper.findAll("[role=menuitemradio]");
        expect(items.map((i) => i.text())).toEqual(["0.75×", "1×", "1.25×", "1.5×", "1.75×", "2×"]);
        await items[3]!.trigger("click");
        expect(wrapper.emitted("rate")![0]).toEqual([1.5]);
        expect(wrapper.find("[role=menu]").exists()).toBe(false);
    });

    it("asks for a language from its menu", async () => {
        const wrapper = mountScreen({
            audioTracks: [
                { id: "en", label: "English" },
                { id: "fr", label: "Français" },
            ],
        });
        await find(wrapper, "afsLanguage").trigger("click");
        await wrapper.findAll("[role=menuitemradio]")[1]!.trigger("click");
        expect(wrapper.emitted("audio-track")![0]).toEqual(["fr"]);
    });

    it("asks for a sleep timer in minutes, for the end of the chapter, and for none", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsSleep").trigger("click");
        await find(wrapper, "afsSleep15").trigger("click");
        await find(wrapper, "afsSleep").trigger("click");
        await find(wrapper, "afsSleepChapter").trigger("click");
        await find(wrapper, "afsSleep").trigger("click");
        await find(wrapper, "afsSleepOff").trigger("click");
        expect(wrapper.emitted("sleep")).toEqual([
            [{ kind: "minutes", minutes: 15 }],
            [{ kind: "chapter" }],
            [null],
        ]);
    });

    it("offers the end of the chapter only when there is a chapter to end", async () => {
        const wrapper = mountScreen({ chapters: [], chapterIndex: -1 });
        await find(wrapper, "afsSleep").trigger("click");
        expect(find(wrapper, "afsSleepChapter").exists()).toBe(false);
    });
});

describe("AudioFullscreen — the sleep timer on show", () => {
    it("says how long is left on the button, and that it stops at the chapter end", () => {
        const minutes = mountScreen({
            sleepTimer: { kind: "minutes", endsAt: Date.now() + 14 * 60_000 + 5_000 },
        });
        expect(find(minutes, "afsSleepCaption").text()).toBe("15 min left");
        const chapter = mountScreen({ sleepTimer: { kind: "chapter", endTime: 180 } });
        expect(find(chapter, "afsSleepCaption").text()).toBe("End of chapter");
        expect(find(mountScreen(), "afsSleepCaption").exists()).toBe(false);
    });

    it("marks the entry that is running", async () => {
        const wrapper = mountScreen({ sleepTimer: { kind: "chapter", endTime: 180 } });
        await find(wrapper, "afsSleep").trigger("click");
        expect(find(wrapper, "afsSleepChapter").attributes("aria-checked")).toBe("true");
        expect(find(wrapper, "afsSleepOff").attributes("aria-checked")).toBe("false");
    });
});

describe("AudioFullscreen — chapters and up next", () => {
    const upNext = [
        { id: "a", title: "Next one", section: "Next in series" },
        { id: "b", title: "Other", section: "Related" },
    ];
    const rows = (wrapper: ReturnType<typeof mountScreen>) => wrapper.findAll(".lmpl-chapter");

    it("opens the web player's own panel over the screen from the button, with every chapter and the playing one marked", async () => {
        const wrapper = mountScreen({ chaptersSheet: true });
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
        await find(wrapper, "afsBrowse").trigger("click");
        expect(find(wrapper, "browsePanel").exists()).toBe(true);
        expect(rows(wrapper)).toHaveLength(8);
        expect(wrapper.find(".lmpl-chapter[aria-current=true]").text()).toContain("Chapter 3");
        expect(wrapper.emitted("open-browse")).toBeUndefined();
    });

    it("asks the host to show them when it is not given a panel of its own", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsBrowse").trigger("click");
        expect(wrapper.emitted("open-browse")).toHaveLength(1);
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
    });

    it("offers Up next as a second tab, and says which one is picked", async () => {
        const wrapper = mountScreen({ chaptersSheet: true, upNext });
        await find(wrapper, "afsBrowse").trigger("click");
        const tabs = wrapper.findAll("[role=tab]");
        expect(tabs.map((tab) => tab.text())).toEqual(["Chapters", "Up next"]);
        await tabs[1]!.trigger("click");
        const items = wrapper.findAll(".lmpl-upnext");
        expect(items).toHaveLength(2);
        await items[1]!.trigger("click");
        expect(wrapper.emitted("upnextselect")![0]).toEqual(["b"]);
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
    });

    it("goes to the chapter that is picked and closes, staying on this screen", async () => {
        const wrapper = mountScreen({ chaptersSheet: true });
        await find(wrapper, "afsBrowse").trigger("click");
        await rows(wrapper)[5]!.trigger("click");
        expect(wrapper.emitted("seek-chapter")![0]).toEqual([chapters[5]]);
        expect(wrapper.emitted("exit")).toBeUndefined();
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
    });

    it("closes on Escape, with the close button, and on a press outside it", async () => {
        const wrapper = mountScreen({ chaptersSheet: true });
        await find(wrapper, "afsBrowse").trigger("click");
        await find(wrapper, "browsePanel").trigger("keydown", { key: "Escape" });
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
        await find(wrapper, "afsBrowse").trigger("click");
        await wrapper.find(".lmpl-browse-close").trigger("click");
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
        await find(wrapper, "afsBrowse").trigger("click");
        await wrapper.find(".lmpl-browse-scrim").trigger("click");
        expect(find(wrapper, "browsePanel").exists()).toBe(false);
    });
});

describe("AudioFullscreen — the menus", () => {
    it("close on Escape, and on a press outside them, but not on a press inside the tools", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsSpeed").trigger("click");
        expect(wrapper.find("[role=menu]").exists()).toBe(true);

        await wrapper.trigger("keydown", { key: "Escape" });
        expect(wrapper.find("[role=menu]").exists()).toBe(false);

        await find(wrapper, "afsSpeed").trigger("click");
        await find(wrapper, "afsTitle").trigger("pointerdown");
        expect(wrapper.find("[role=menu]").exists()).toBe(false);

        await find(wrapper, "afsSpeed").trigger("click");
        await find(wrapper, "afsSpeed").trigger("pointerdown");
        expect(wrapper.find("[role=menu]").exists()).toBe(true);
    });

    it("are kept on the screen: no taller than the room above their button, and no further out than its edges", async () => {
        const rect = (left: number, top: number, width: number, height: number) => ({
            left,
            top,
            width,
            height,
            right: left + width,
            bottom: top + height,
            x: left,
            y: top,
            toJSON: () => ({}),
        });
        const spy = vi
            .spyOn(Element.prototype, "getBoundingClientRect")
            .mockImplementation(function (this: Element) {
                if (this.matches(".lmpl-afs")) return rect(0, 0, 844, 390) as DOMRect;
                if (this.matches(".lmpl-afs-tool")) return rect(700, 330, 52, 52) as DOMRect;
                if (this.matches("[role=menu]")) return rect(690, 30, 150, 290) as DOMRect;
                return rect(0, 0, 0, 0) as DOMRect;
            });
        try {
            const wrapper = mountScreen();
            await find(wrapper, "afsSleep").trigger("click");
            await wrapper.vm.$nextTick();
            const menu = wrapper.find("[role=menu]").element as HTMLElement;
            // 330 (the button's top) - 12 (the gap) - 8 (the margin) leaves 310 px.
            expect(menu.style.maxHeight).toBe("310px");
            // The menu ends at 840, past the 832 that keeps a 12 px margin: it moves 8 px in.
            expect(menu.style.translate).toBe("-8px 0");
        } finally {
            spy.mockRestore();
        }
    });

    it("open one at a time", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsSpeed").trigger("click");
        await find(wrapper, "afsSleep").trigger("click");
        expect(wrapper.findAll("[role=menu]")).toHaveLength(1);
        expect(wrapper.find("[role=menu]").attributes("aria-label")).toBe("Sleep timer");
    });
});

describe("a tap on the picture", () => {
    const stage = { stage: "<div />" };
    const tap = async (wrapper: ReturnType<typeof mountScreen>, moveTo = 0) => {
        const slot = find(wrapper, "afsStageSlot");
        await slot.trigger("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
        await slot.trigger("pointerup", { pointerId: 1, clientX: 100, clientY: 100 + moveTo });
    };

    it("plays or pauses it, with no scrub band over its foot", async () => {
        const wrapper = mountScreen({ stage: "video" }, stage);
        expect(wrapper.find('[data-test="afsScrubZone"]').exists()).toBe(false);
        await tap(wrapper);
        expect(wrapper.emitted("toggle-play")).toHaveLength(1);
        wrapper.unmount();
    });

    it("is not a tap once the finger has travelled, or while the player gets ready", async () => {
        const wrapper = mountScreen({ stage: "video" }, stage);
        await tap(wrapper, 40);
        await wrapper.setProps({ busy: true });
        await tap(wrapper);
        expect(wrapper.emitted("toggle-play")).toBeUndefined();
        wrapper.unmount();
    });

    it("only closes a menu that is open", async () => {
        const wrapper = mountScreen({ stage: "video" }, stage);
        await find(wrapper, "afsSpeed").trigger("click");
        await find(wrapper, "afsStageSlot").trigger("pointerdown", { pointerId: 1 });
        await find(wrapper, "afsStageSlot").trigger("pointerup", { pointerId: 1 });
        expect(wrapper.emitted("toggle-play")).toBeUndefined();
        expect(wrapper.find("[role=menu]").exists()).toBe(false);
        wrapper.unmount();
    });
});

describe("the picture's place with a band for subtitles", () => {
    it("is a 16:9 picture plus the band when the video's shape is not known", async () => {
        const { readFileSync } = await import("node:fs");
        const css = readFileSync(`${process.cwd()}/src/media-player/player/styles.css`, "utf8");
        const rule = css.match(
            /\.lmpl-afs-captions \.lmpl-afs-art\s*{[^}]*height:\s*calc\(([^;]*)\);/,
        )!;
        // A custom property's fallback is pasted in as text, as the browser does: no `--lmpl-stage-ar` is set.
        const expression = rule[1]
            .replace(/var\(--lmpl-stage-gutter, 0px\)/g, "0px")
            .replace(/var\(--lmpl-stage-ar, ([^)]*)\)/g, "$1")
            .replace(/100cqw/g, "384px")
            .replace(/px/g, "");
        const height = Function(`return (${expression})`)() as number;
        expect(height).toBeCloseTo(384 / (16 / 9) + 64);
    });
});

describe("the rows under the timeline", () => {
    it("keeps the tools a gap apart from the transport when they stack", async () => {
        const { readFileSync } = await import("node:fs");
        const css = readFileSync(`${process.cwd()}/src/media-player/player/styles.css`, "utf8");
        const rule = css.match(/^\.lmpl-afs-bottomrow\s*{[^}]*row-gap:\s*([^;]*);/m)!;
        expect(rule[1]).toBe("calc(12px * var(--lmpl-s))");
    });
});

describe("AudioFullscreen — chapter skips", () => {
    it("goes to the next chapter's start, and back to this one's when well into it", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsNextChapter").trigger("click");
        expect(wrapper.emitted("seek")).toEqual([[180]]);

        const back = mountScreen();
        await find(back, "afsPreviousChapter").trigger("click");
        expect(back.emitted("seek")).toEqual([[120]]);
    });

    it("steps back chapter by chapter on presses in a row", async () => {
        const wrapper = mountScreen();
        await find(wrapper, "afsPreviousChapter").trigger("click");
        await find(wrapper, "afsPreviousChapter").trigger("click");
        expect(wrapper.emitted("seek")).toEqual([[120], [60]]);
    });

    it("disables next in the last chapter", () => {
        const wrapper = mountScreen({ currentTime: 450 });
        expect(find(wrapper, "afsNextChapter").attributes("disabled")).toBeDefined();
        expect(find(wrapper, "afsPreviousChapter").attributes("disabled")).toBeUndefined();
    });

    it("has no chapter skips without two chapters, or on a live stream", () => {
        for (const props of [
            { chapters: [] },
            { chapters: chapters.slice(0, 1) },
            { live: true },
        ]) {
            const wrapper = mountScreen(props);
            expect(find(wrapper, "afsPreviousChapter").exists()).toBe(false);
            expect(find(wrapper, "afsNextChapter").exists()).toBe(false);
        }
    });

    it("names the buttons from the messages", () => {
        const wrapper = mountScreen({
            messages: { ...DEFAULT_MESSAGES, previousChapter: "Vorige", nextChapter: "Volgende" },
        });
        expect(find(wrapper, "afsPreviousChapter").attributes("aria-label")).toBe("Vorige");
        expect(find(wrapper, "afsNextChapter").attributes("aria-label")).toBe("Volgende");
    });
});

describe("AudioFullscreen: badges, gear menu, end panel, tool slots", () => {
    it("badges the quality with the held height, else the height Auto plays, and names it on the Auto row", async () => {
        const qualities = [
            { id: "720", label: "720p", height: 720 },
            { id: "480", label: "480p", height: 480 },
        ];
        const wrapper = mountScreen({
            stage: "video",
            qualities,
            activeQualityId: "auto",
            playingHeight: 480,
        });
        expect(find(wrapper, "afsQualityBadge").text()).toBe("480p");
        await find(wrapper, "afsQuality").trigger("click");
        expect(find(wrapper, "afsQualityAuto").text()).toBe("Auto (480p)");
        await wrapper.setProps({ activeQualityId: "720" });
        expect(find(wrapper, "afsQualityBadge").text()).toBe("720p");
        wrapper.unmount();
    });

    it("badges the audio button with the playing track's language, none for an untagged original", async () => {
        const wrapper = mountScreen({
            audioTracks: [
                { id: "a", label: "Português", lang: "pt-BR" },
                { id: "b", label: "Original", lang: "mul" },
            ],
            activeAudioTrackId: "a",
        });
        expect(find(wrapper, "afsLanguageBadge").text()).toBe("PT");
        await wrapper.setProps({ activeAudioTrackId: "b" });
        expect(wrapper.find('[data-test="afsLanguageBadge"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it("reads three-letter language tags as their two-letter code on the badges", async () => {
        const wrapper = mountScreen({
            stage: "video",
            audioTracks: [
                { id: "a", label: "English", lang: "eng" },
                { id: "b", label: "Français", lang: "fre" },
            ],
            activeAudioTrackId: "a",
            subtitleTracks: [{ id: "s", label: "Français", lang: "fra" }],
            activeSubtitleTrackId: "s",
        });
        expect(find(wrapper, "afsLanguageBadge").text()).toBe("EN");
        expect(find(wrapper, "afsSubtitlesBadge").text()).toBe("FR");
        await wrapper.setProps({ activeSubtitleTrackId: null });
        expect(wrapper.find('[data-test="afsSubtitlesBadge"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it("badges the sound's subtitles (lyrics) tool with the language that is on", () => {
        const wrapper = mountScreen({
            stage: "cover",
            subtitleTracks: [{ id: "s", label: "English", lang: "en-GB" }],
            activeSubtitleTrackId: "s",
        });
        expect(find(wrapper, "afsSubtitlesBadge").text()).toBe("EN");
        wrapper.unmount();
    });

    it("ticks the minutes row of a running timer", async () => {
        const wrapper = mountScreen({
            stage: "cover",
            sleepTimer: { kind: "minutes", endsAt: Date.now() + 15 * 60_000 },
            sleepMinutes: 15,
        });
        await find(wrapper, "afsSleep").trigger("click");
        expect(find(wrapper, "afsSleep15").attributes("aria-checked")).toBe("true");
        expect(find(wrapper, "afsSleep5").attributes("aria-checked")).toBe("false");
        wrapper.unmount();
    });

    it("keeps the headphones in their slot when sound and picture switch", async () => {
        const order = (w: ReturnType<typeof mountScreen>) =>
            w.findAll("[data-afs-tools] [data-test]").map((el) => el.attributes("data-test"));
        const wrapper = mountScreen({
            stage: "video",
            qualities: [
                { id: "720", label: "720p" },
                { id: "480", label: "480p" },
            ],
            audioTracks: [
                { id: "en", label: "English" },
                { id: "fr", label: "Français" },
            ],
            subtitleTracks: [{ id: "s", label: "English" }],
        });
        const video = order(wrapper).filter((id) => !id?.endsWith("Badge"));
        await wrapper.setProps({ stage: "cover" });
        const sound = order(wrapper).filter((id) => !id?.endsWith("Badge"));
        expect(video.slice(0, 3)).toEqual(["afsSpeed", "afsQuality", "afsLanguage"]);
        expect(sound.slice(0, 4)).toEqual(["afsSpeed", "afsQuality", "afsSleep", "afsLanguage"]);
        wrapper.unmount();
    });

    it("switches Data Saver at the foot of the quality menu: on is Light, Strict reads as on", async () => {
        const wrapper = mountScreen({
            stage: "video",
            dataSaver: "off",
            qualities: [
                { id: "720", label: "720p", height: 720 },
                { id: "360", label: "360p", height: 360 },
            ],
        });
        await find(wrapper, "afsQuality").trigger("click");
        expect(find(wrapper, "afsDataSaver").attributes("aria-checked")).toBe("false");
        await find(wrapper, "afsDataSaver").trigger("click");
        expect(wrapper.emitted("data-saver")).toEqual([["light"]]);
        await wrapper.setProps({ dataSaver: "strict" });
        expect(find(wrapper, "afsDataSaver").attributes("aria-checked")).toBe("true");
        await find(wrapper, "afsDataSaver").trigger("click");
        expect(wrapper.emitted("data-saver")?.at(-1)).toEqual(["off"]);
        expect(wrapper.find('[data-test="afsSettings"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it("offers the sound's renditions and the Data Saver switch with sound alone", async () => {
        const wrapper = mountScreen({
            stage: "cover",
            dataSaver: "off",
            qualities: [
                { id: "a128", label: "128 kbps" },
                { id: "a64", label: "64 kbps" },
                { id: "720", label: "720p", height: 720 },
            ],
        });
        await find(wrapper, "afsQuality").trigger("click");
        const rows = wrapper.findAll("[role=menu] .lmpl-afs-menuitem").map((row) => row.text());
        expect(rows).toEqual(["Auto", "128 kbps", "64 kbps", "Data saver"]);
        wrapper.unmount();
    });

    it("hides the sound's bitrates above the lowest under Data Saver, keeping one the viewer holds", async () => {
        const sound = [
            { id: "b256000", label: "256 kbps", bandwidth: 256000 },
            { id: "b128000", label: "128 kbps", bandwidth: 128000 },
            { id: "b64000", label: "64 kbps", bandwidth: 64000 },
        ];
        const rows = async (props: Record<string, unknown>) => {
            const wrapper = mountScreen({ stage: "cover", qualities: sound, ...props });
            await find(wrapper, "afsQuality").trigger("click");
            const text = wrapper.findAll("[role=menu] .lmpl-afs-menuitem").map((row) => row.text());
            wrapper.unmount();
            return text;
        };
        expect(await rows({ dataSaver: "light" })).toEqual(["Data saver"]);
        expect(await rows({ dataSaver: "strict", activeQualityId: "b256000" })).toEqual([
            "Auto",
            "256 kbps",
            "64 kbps",
            "Data saver",
        ]);
        expect(await rows({ dataSaver: "off" })).toEqual([
            "Auto",
            "256 kbps",
            "128 kbps",
            "64 kbps",
            "Data saver",
        ]);
    });

    it("shows the quality tool with sound alone for the Data Saver switch, though there is one rendition", () => {
        const wrapper = mountScreen({ stage: "cover", dataSaver: "off" });
        expect(wrapper.find('[data-test="afsQuality"]').exists()).toBe(true);
        wrapper.unmount();
    });

    it("flips autoplay with its switch beside the picture tools", async () => {
        const wrapper = mountScreen({ autoplay: true });
        const toggle = find(wrapper, "afsAutoplay");
        expect(toggle.attributes("aria-checked")).toBe("true");
        expect(toggle.element.closest('[data-test="afsPictureTools"]')).not.toBeNull();
        await toggle.trigger("click");
        expect(wrapper.emitted("autoplay")).toEqual([[false]]);
        wrapper.unmount();
    });

    it("has no autoplay switch when the host offers none", () => {
        const wrapper = mountScreen();
        expect(wrapper.find('[data-test="afsAutoplay"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it("offers the cameras in portrait when there is more than one", async () => {
        const wrapper = mountScreen({
            stage: "video",
            angles: [
                { id: "wide", label: "Wide" },
                { id: "close", label: "Close" },
            ],
            activeAngleId: "wide",
        });
        await find(wrapper, "afsCamera").trigger("click");
        const rows = wrapper.findAll("[role=menu] .lmpl-afs-menuitem");
        expect(rows[0]!.attributes("aria-checked")).toBe("true");
        await rows[1]!.trigger("click");
        expect(wrapper.emitted("angle")).toEqual([["close"]]);
        await wrapper.setProps({ angles: [{ id: "wide", label: "Wide" }] });
        expect(wrapper.find('[data-test="afsCamera"]').exists()).toBe(false);
        wrapper.unmount();
    });

    it("counts down at the end to the next video and picks it, with autoplay on", async () => {
        vi.useFakeTimers();
        const next = { id: "next", title: "Next one" };
        const wrapper = mountScreen({ ended: true, autoplay: true, nextUp: next });
        await wrapper.vm.$nextTick();
        expect(find(wrapper, "afsEndPanel").text()).toContain("Next one");
        expect(find(wrapper, "afsCountdown").text()).toBe("5");
        vi.advanceTimersByTime(5100);
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted("upnextselect")).toEqual([["next"]]);
        expect(wrapper.find('[data-test="afsEndPanel"]').exists()).toBe(false);
        vi.useRealTimers();
        wrapper.unmount();
    });

    it("shows only the replay glyph at the end with autoplay off, and replays", async () => {
        const wrapper = mountScreen({
            ended: true,
            autoplay: false,
            nextUp: { id: "next", title: "Next one" },
        });
        expect(wrapper.find('[data-test="afsEndPanel"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="afsReplayIcon"]').exists()).toBe(true);
        await find(wrapper, "afsPlay").trigger("click");
        expect(wrapper.emitted("replay")).toHaveLength(1);
        wrapper.unmount();
    });

    it("drops the countdown on Cancel, and Play now picks at once", async () => {
        const next = { id: "next", title: "Next one" };
        const wrapper = mountScreen({ ended: true, autoplay: true, nextUp: next });
        await find(wrapper, "afsEndCancel").trigger("click");
        expect(wrapper.find('[data-test="afsEndPanel"]').exists()).toBe(false);
        expect(wrapper.emitted("upnextselect")).toBeUndefined();
        await wrapper.setProps({ nextUp: { id: "other", title: "Other" } });
        await find(wrapper, "afsEndPlayNow").trigger("click");
        expect(wrapper.emitted("upnextselect")).toEqual([["other"]]);
        wrapper.unmount();
    });

    it("hides the title block while the host's strip is up", () => {
        const wrapper = mountScreen({}, { roster: "<div class='strip'></div>" });
        expect(wrapper.find(".lmpl-afs-titles").classes()).toContain("lmpl-afs-titles-away");
        wrapper.unmount();
        const plain = mountScreen();
        expect(plain.find(".lmpl-afs-titles").classes()).not.toContain("lmpl-afs-titles-away");
        plain.unmount();
    });
});
