import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ContentChaptersPanel from "./ContentChaptersPanel.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { chaptersPanelFolded } from "@/globalConfig";

// The real one is player-core's, tested there: the last chapter that has started.
vi.mock("@luminary-media-converter/player-web", () => ({
    chapterIndexAt: (chapters: { startTime: number }[], time: number) =>
        chapters.reduce((found, chapter, index) => (chapter.startTime <= time ? index : found), -1),
}));

const chapter = (index: number) => ({
    startTime: index * 60,
    endTime: index * 60 + 60,
    title: `Chapter ${index + 1}`,
});
const chapters = (count: number) => Array.from({ length: count }, (_, i) => chapter(i));

const next = {
    ...mockEnglishContentDto,
    _id: "next-1",
    parentId: "next-1-parent",
    title: "The next one",
};
const upNext = (count = 0) => ({
    next: Array.from({ length: count }, (_, i) => ({ ...next, _id: `n${i}`, title: `Next ${i}` })),
    related: [],
    tags: [],
});

const cue = { spriteUrl: "blob:sprite", x: 0, y: 0, w: 160, h: 90, start: 0, end: 10 };

function mountPanel(props: Record<string, unknown> = {}) {
    return mount(ContentChaptersPanel, {
        props: {
            chapters: chapters(4),
            currentTime: 130,
            upNext: upNext(2),
            selectedTag: null,
            wide: false,
            ...props,
        },
        global: { stubs: { MediaPlayerUpNext: { template: "<div data-test='upNextStub' />" } } },
    });
}
const tab = (wrapper: ReturnType<typeof mountPanel>, id: string) =>
    wrapper.find(`[data-test='chaptersPanelTab-${id}']`);
const rows = (wrapper: ReturnType<typeof mountPanel>) =>
    wrapper.findAll("[data-test='mediaPlayerChapter']");

describe("ContentChaptersPanel", () => {
    beforeEach(() => {
        chaptersPanelFolded.value = false;
    });

    describe("which tabs there are", () => {
        it("has a tab only for what exists", async () => {
            const both = mountPanel();
            expect(both.findAll("[role=tab]").map((t) => t.attributes("data-test"))).toEqual([
                "chaptersPanelTab-chapters",
                "chaptersPanelTab-upnext",
            ]);

            const noChapters = mountPanel({ chapters: [] });
            expect(noChapters.findAll("[role=tab]").map((t) => t.attributes("data-test"))).toEqual([
                "chaptersPanelTab-upnext",
            ]);

            const noUpNext = mountPanel({ upNext: upNext(0) });
            expect(noUpNext.findAll("[role=tab]").map((t) => t.attributes("data-test"))).toEqual([
                "chaptersPanelTab-chapters",
            ]);
        });

        it("draws nothing when there are neither chapters nor anything to go on to", () => {
            const wrapper = mountPanel({ chapters: [], upNext: upNext(0) });
            expect(wrapper.find("[data-test='chaptersPanel']").exists()).toBe(false);
        });

        it("keeps Up next while a chosen tag has nothing left, so the viewer can go back to All", () => {
            const wrapper = mountPanel({ chapters: [], upNext: upNext(0), selectedTag: "tag-1" });
            expect(tab(wrapper, "upnext").exists()).toBe(true);
        });
    });

    describe("under the player", () => {
        it("has the first tab open, and a tab switches to its list", async () => {
            const wrapper = mountPanel();
            expect(wrapper.find("[data-test='chaptersPanelChapters']").exists()).toBe(true);
            expect(rows(wrapper)).toHaveLength(4);

            await tab(wrapper, "upnext").trigger("click");
            expect(wrapper.find("[data-test='chaptersPanelChapters']").exists()).toBe(false);
            expect(wrapper.find("[data-test='upNextStub']").exists()).toBe(true);
            expect(tab(wrapper, "chapters").attributes("aria-selected")).toBe("false");
        });

        it("is joined to the player's foot when attached", () => {
            const attached = mountPanel({ attached: true });
            expect(attached.find("[data-test='chaptersPanel']").classes()).toContain(
                "rounded-b-xl",
            );
            const alone = mountPanel();
            expect(alone.find("[data-test='chaptersPanel']").classes()).toContain("rounded-xl");
        });

        it("shows a few chapters led by a frame of the video, and every one when opened", async () => {
            const wrapper = mountPanel({
                chapters: chapters(12),
                cueAt: () => cue,
                currentTime: 6 * 60,
            });
            expect(rows(wrapper)).toHaveLength(4);
            expect(wrapper.findAll("[data-test='mediaPlayerChapterFrame']")).toHaveLength(4);
            // Starts one before the playing chapter, and the playing one is among them.
            expect(rows(wrapper)[0]!.text()).toContain("Chapter 6");
            expect(wrapper.find("[aria-current=true]").text()).toContain("Chapter 7");

            await wrapper.find("[data-test='chaptersPanelMore']").trigger("click");
            expect(rows(wrapper)).toHaveLength(12);
            expect(wrapper.find("ol").classes()).toContain("overflow-y-auto");
        });

        it("has no 'Show all' when everything fits", () => {
            const wrapper = mountPanel({ chapters: chapters(4) });
            expect(wrapper.find("[data-test='chaptersPanelMore']").exists()).toBe(false);
        });

        it("leaves the rows as text when the video has no frames", () => {
            const wrapper = mountPanel({ cueAt: () => null });
            expect(wrapper.find("[data-test='mediaPlayerChapterFrame']").exists()).toBe(false);
        });

        it("has no chevrons on the tabs: they switch, they do not open and close", () => {
            const wrapper = mountPanel();
            expect(tab(wrapper, "chapters").find("svg").exists()).toBe(false);
            expect(tab(wrapper, "chapters").attributes("aria-expanded")).toBeUndefined();
        });
    });

    describe("putting the panel away", () => {
        it("folds under the player with the arrow, and the arrow opens it again", async () => {
            const wrapper = mountPanel();
            const fold = wrapper.find("[data-test='chaptersPanelFold']");
            expect(fold.attributes("aria-expanded")).toBe("true");
            expect(wrapper.find("#chapters-panel-body").attributes("style") ?? "").not.toContain(
                "display: none",
            );

            await fold.trigger("click");
            expect(fold.attributes("aria-expanded")).toBe("false");
            expect(wrapper.find("#chapters-panel-body").attributes("style")).toContain(
                "display: none",
            );
            // The tabs stay, to say what is there.
            expect(tab(wrapper, "chapters").exists()).toBe(true);

            await fold.trigger("click");
            expect(wrapper.find("#chapters-panel-body").attributes("style") ?? "").not.toContain(
                "display: none",
            );
        });

        it("opens when a tab is chosen while it is folded", async () => {
            const wrapper = mountPanel();
            await wrapper.find("[data-test='chaptersPanelFold']").trigger("click");
            await tab(wrapper, "upnext").trigger("click");
            expect(
                wrapper.find("[data-test='chaptersPanelFold']").attributes("aria-expanded"),
            ).toBe("true");
            expect(wrapper.find("[data-test='upNextStub']").exists()).toBe(true);
        });

        it("remembers it for the next page", async () => {
            const wrapper = mountPanel();
            await wrapper.find("[data-test='chaptersPanelFold']").trigger("click");
            expect(localStorage.getItem("chaptersPanelFolded")).toBe("true");
            await wrapper.find("[data-test='chaptersPanelFold']").trigger("click");
            expect(localStorage.getItem("chaptersPanelFolded")).toBe("false");
        });

        it("never puts the column beside the content away", () => {
            chaptersPanelFolded.value = true;
            const wrapper = mountPanel({ wide: true });
            expect(wrapper.find("[data-test='chaptersPanelFold']").exists()).toBe(false);
            expect(wrapper.find("#chapters-panel-body").attributes("style") ?? "").not.toContain(
                "display: none",
            );
        });
    });

    describe("in the column beside the content", () => {
        it("has the first tab open, and no chevrons or toggling", async () => {
            const wrapper = mountPanel({ wide: true });
            expect(wrapper.find("[data-test='chaptersPanelChapters']").exists()).toBe(true);
            expect(tab(wrapper, "chapters").attributes("aria-expanded")).toBeUndefined();

            await tab(wrapper, "chapters").trigger("click");
            expect(wrapper.find("[data-test='chaptersPanelChapters']").exists()).toBe(true);

            await tab(wrapper, "upnext").trigger("click");
            expect(wrapper.find("[data-test='upNextStub']").exists()).toBe(true);
            expect(wrapper.find("svg").exists()).toBe(false);
        });

        it("draws text rows only, whatever frames the video has", () => {
            const wrapper = mountPanel({ wide: true, cueAt: () => cue });
            expect(wrapper.find("[data-test='mediaPlayerChapterFrame']").exists()).toBe(false);
        });

        it("shows a few rows around the playing chapter, and opens the rest in place", async () => {
            const wrapper = mountPanel({
                wide: true,
                chapters: chapters(20),
                currentTime: 12 * 60,
            });
            const titles = () => rows(wrapper).map((r) => r.text());
            expect(rows(wrapper)).toHaveLength(7);
            // Starts one before the playing chapter (the 13th), and the playing one is among them.
            expect(titles()[0]).toContain("Chapter 12");
            expect(wrapper.find("[aria-current=true]").text()).toContain("Chapter 13");

            await wrapper.find("[data-test='chaptersPanelMore']").trigger("click");
            expect(rows(wrapper)).toHaveLength(20);
            expect(
                wrapper.find("[data-test='chaptersPanelMore']").attributes("aria-expanded"),
            ).toBe("true");
        });

        it("keeps the window inside the list at both ends", () => {
            const start = mountPanel({ wide: true, chapters: chapters(20), currentTime: 0 });
            expect(rows(start)[0]!.text()).toContain("Chapter 1");
            expect(rows(start)).toHaveLength(7);

            const end = mountPanel({ wide: true, chapters: chapters(20), currentTime: 19 * 60 });
            expect(rows(end).at(-1)!.text()).toContain("Chapter 20");
            expect(rows(end)).toHaveLength(7);
        });

        it("has no 'Show all' when everything fits", () => {
            const wrapper = mountPanel({ wide: true, chapters: chapters(7) });
            expect(wrapper.find("[data-test='chaptersPanelMore']").exists()).toBe(false);
        });
    });

    describe("the column's head", () => {
        it("says where the playhead is among the chapters, beside the content and under the player", () => {
            for (const wide of [true, false]) {
                const wrapper = mountPanel({ wide });
                expect(wrapper.find("[data-test='chaptersPanelPosition']").text()).toBe(
                    "media_player.chapter_position",
                );
            }
        });

        it("says nothing without chapters", () => {
            const wrapper = mountPanel({ wide: true, chapters: [] });
            expect(wrapper.find("[data-test='chaptersPanelPosition']").exists()).toBe(false);
        });
    });

    describe("the frames", () => {
        it("are 100px, with a bar along the foot for how much has played", () => {
            const wrapper = mountPanel({ cueAt: () => cue, currentTime: 90 });
            const frames = wrapper.findAll("[data-test='mediaPlayerChapterFrame']");
            expect(frames[0]!.attributes("style")).toContain("width: 100px");
            const bars = wrapper.findAll("[data-test='mediaPlayerChapterProgress']");
            // 90s is the end of the first chapter, half way through the second, and before the rest.
            expect(bars.map((bar) => bar.attributes("style"))).toEqual([
                expect.stringContaining("width: 100%"),
                expect.stringContaining("width: 50%"),
                expect.stringContaining("width: 0%"),
                expect.stringContaining("width: 0%"),
            ]);
        });
    });

    describe("the keyboard", () => {
        it("reaches one tab at a time: the open one, else the first", async () => {
            const wrapper = mountPanel();
            expect(tab(wrapper, "chapters").attributes("tabindex")).toBe("0");
            expect(tab(wrapper, "upnext").attributes("tabindex")).toBe("-1");

            await tab(wrapper, "upnext").trigger("click");
            expect(tab(wrapper, "chapters").attributes("tabindex")).toBe("-1");
            expect(tab(wrapper, "upnext").attributes("tabindex")).toBe("0");
        });

        it("moves between the tabs with the arrows, and to the ends with Home and End", async () => {
            const wrapper = mountPanel({ wide: true });
            const list = wrapper.find("[role=tablist]");
            await tab(wrapper, "chapters").trigger("keydown", { key: "ArrowRight" });
            expect(tab(wrapper, "upnext").attributes("aria-selected")).toBe("true");

            await tab(wrapper, "upnext").trigger("keydown", { key: "ArrowRight" });
            expect(tab(wrapper, "chapters").attributes("aria-selected")).toBe("true");

            await tab(wrapper, "chapters").trigger("keydown", { key: "End" });
            expect(tab(wrapper, "upnext").attributes("aria-selected")).toBe("true");
            await tab(wrapper, "upnext").trigger("keydown", { key: "Home" });
            expect(tab(wrapper, "chapters").attributes("aria-selected")).toBe("true");
            expect(list.exists()).toBe(true);
        });

        it("leaves other keys alone", async () => {
            const wrapper = mountPanel({ wide: true });
            await tab(wrapper, "chapters").trigger("keydown", { key: "a" });
            expect(tab(wrapper, "chapters").attributes("aria-selected")).toBe("true");
        });
    });

    describe("what the viewer can do", () => {
        it("tells the page when 'Show all' is open, so the column can let go of its place", async () => {
            const wrapper = mountPanel({ wide: true, chapters: chapters(20) });
            await wrapper.find("[data-test='chaptersPanelMore']").trigger("click");
            expect(wrapper.emitted("update:expanded")!.at(-1)).toEqual([true]);
            await wrapper.find("[data-test='chaptersPanelMore']").trigger("click");
            expect(wrapper.emitted("update:expanded")!.at(-1)).toEqual([false]);
        });

        it("marks the chapter the playhead is in, in words as well as colour", async () => {
            const wrapper = mountPanel({ wide: true });
            expect(wrapper.findAll("[aria-current=true]")).toHaveLength(1);
            expect(wrapper.find("[aria-current=true]").text()).toContain("Chapter 3");
            expect(wrapper.find("[data-test='mediaPlayerChapterNow']").exists()).toBe(true);
        });

        it("asks to go to a chapter that is chosen", async () => {
            const wrapper = mountPanel({ wide: true });
            await rows(wrapper)[1]!.trigger("click");
            expect(wrapper.emitted("seek-chapter")![0]).toEqual([chapter(1)]);
        });
    });
});
