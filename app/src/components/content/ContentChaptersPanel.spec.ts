import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ContentChaptersPanel from "./ContentChaptersPanel.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";

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

    describe("in the strip under the player", () => {
        it("starts closed, and a tab opens its list and closes it again", async () => {
            const wrapper = mountPanel();
            expect(wrapper.find("[role=tabpanel]").exists()).toBe(false);
            expect(tab(wrapper, "chapters").attributes("aria-expanded")).toBe("false");

            await tab(wrapper, "chapters").trigger("click");
            expect(tab(wrapper, "chapters").attributes("aria-expanded")).toBe("true");
            expect(tab(wrapper, "chapters").attributes("aria-selected")).toBe("true");
            expect(rows(wrapper)).toHaveLength(4);

            await tab(wrapper, "chapters").trigger("click");
            expect(wrapper.find("[role=tabpanel]").exists()).toBe(false);
        });

        it("switches to the other tab when it is chosen while one is open", async () => {
            const wrapper = mountPanel();
            await tab(wrapper, "chapters").trigger("click");
            await tab(wrapper, "upnext").trigger("click");
            expect(wrapper.find("[data-test='chaptersPanelChapters']").exists()).toBe(false);
            expect(wrapper.find("[data-test='upNextStub']").exists()).toBe(true);
            expect(tab(wrapper, "chapters").attributes("aria-selected")).toBe("false");
        });

        it("shows every chapter, with a frame of the video where there is one", async () => {
            const wrapper = mountPanel({ chapters: chapters(12), cueAt: () => cue });
            await tab(wrapper, "chapters").trigger("click");
            expect(rows(wrapper)).toHaveLength(12);
            expect(wrapper.findAll("[data-test='mediaPlayerChapterFrame']")).toHaveLength(12);
            expect(wrapper.find("[data-test='chaptersPanelMore']").exists()).toBe(false);
        });

        it("leaves the rows as text when the video has no frames", async () => {
            const wrapper = mountPanel({ cueAt: () => null });
            await tab(wrapper, "chapters").trigger("click");
            expect(wrapper.find("[data-test='mediaPlayerChapterFrame']").exists()).toBe(false);
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
            const wrapper = mountPanel({ wide: true, chapters: chapters(20), currentTime: 12 * 60 });
            const titles = () => rows(wrapper).map((r) => r.text());
            expect(rows(wrapper)).toHaveLength(7);
            // Starts one before the playing chapter (the 13th), and the playing one is among them.
            expect(titles()[0]).toContain("Chapter 12");
            expect(wrapper.find("[aria-current=true]").text()).toContain("Chapter 13");

            await wrapper.find("[data-test='chaptersPanelMore']").trigger("click");
            expect(rows(wrapper)).toHaveLength(20);
            expect(wrapper.find("[data-test='chaptersPanelMore']").attributes("aria-expanded")).toBe(
                "true",
            );
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

    describe("what the viewer can do", () => {
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
