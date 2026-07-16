import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { db, DocType, PublishStatus, TagType, type ContentDto } from "luminary-shared";
import ReadMore from "./ReadMore.vue";
import waitForExpect from "wait-for-expect";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import { appLanguageIdsAsRef } from "@/globalConfig";

// Capture the observer callback so tests can simulate the infinite-scroll sentinel
// entering the viewport (jsdom has no layout, so it never fires on its own).
let intersect: (entries: Array<{ isIntersecting: boolean }>) => void;
beforeEach(() => {
    window.IntersectionObserver = class {
        constructor(cb: IntersectionObserverCallback) {
            intersect = cb as unknown as typeof intersect;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof IntersectionObserver;
    appLanguageIdsAsRef.value = ["lang-eng"];
});

afterEach(async () => {
    await db.docs.clear();
});

const makeItem = (overrides: Partial<ContentDto> = {}): ContentDto =>
    ({
        _id: "content-1",
        slug: "post-1",
        title: "A short title",
        summary: "A short summary",
        publishDate: 1_700_000_000_000,
        parentId: "post-1",
        ...overrides,
    }) as ContentDto;

const makeItems = (count: number): ContentDto[] =>
    Array.from({ length: count }, (_, i) =>
        makeItem({ _id: `content-${i}`, slug: `post-${i}`, title: `Post ${i}` }),
    );

const mountList = (items: ContentDto[]) =>
    mount(ReadMore, {
        props: { items },
        global: {
            stubs: {
                // Render the link's slot without pulling in the router; skip image internals.
                RouterLink: { template: "<a><slot /></a>" },
                LImage: true,
            },
        },
    });

describe("ReadMore", () => {
    it("uses a card surface while keeping the mobile image-and-text row", () => {
        const wrapper = mountList([makeItem()]);

        const card = wrapper.get("a");
        expect(card.classes()).toContain("rounded-lg");
        expect(card.classes()).toContain("overflow-hidden");
        expect(card.classes()).toContain("shadow");
        expect(card.classes()).not.toContain("p-1");
        expect(card.classes()).toContain("flex");
        expect(card.classes()).toContain("sm:flex-col");
    });

    it("keeps the mobile title to a single truncated line", () => {
        const wrapper = mountList([makeItem()]);

        const mobileTitle = wrapper.findAll("h3").find((h) => h.classes().includes("sm:hidden"));
        expect(mobileTitle).toBeDefined();
        expect(mobileTitle!.classes()).toContain("truncate");
    });

    it("wraps the card title on the image instead of truncating it", () => {
        const wrapper = mountList([makeItem()]);

        const cardTitle = wrapper.findAll("h3").find((h) => !h.classes().includes("sm:hidden"));
        expect(cardTitle).toBeDefined();
        expect(cardTitle!.text()).toBe("A short title");
        expect(cardTitle!.classes()).not.toContain("truncate");
        expect(cardTitle!.classes().some((c) => c.startsWith("line-clamp"))).toBe(false);
    });

    it("clamps the summary to one line on mobile and two lines on the card", () => {
        const wrapper = mountList([makeItem()]);

        const summary = wrapper.get("p");
        const summaryArea = summary.element.parentElement!;
        expect(summary.text()).toBe("A short summary");
        expect(summary.classes()).toContain("line-clamp-1");
        expect(summary.classes()).toContain("sm:line-clamp-2");
        expect(summary.classes()).not.toContain("sm:mx-auto");
        expect(summaryArea.classList).toContain("sm:justify-center");
    });

    it("shows the content tags in a horizontally scrollable mobile row", async () => {
        await db.docs.bulkPut([
            mockLanguageDtoEng,
            {
                ...makeItem(),
                _id: "content-category-1",
                type: DocType.Content,
                parentId: "category-1",
                parentType: DocType.Tag,
                parentTagType: TagType.Category,
                language: "lang-eng",
                title: "Category 1",
                slug: "category-1",
                parentTags: [],
                status: PublishStatus.Published,
            },
            {
                ...makeItem(),
                _id: "content-topic-1",
                type: DocType.Content,
                parentId: "topic-1",
                parentType: DocType.Tag,
                parentTagType: TagType.Topic,
                language: "lang-eng",
                title: "Topic 1",
                slug: "topic-1",
                parentTags: [],
                status: PublishStatus.Published,
            },
        ] as ContentDto[]);

        const wrapper = mountList([
            makeItem({ parentTags: ["category-1", "topic-1"] }),
        ]);

        await waitForExpect(() => {
            const tags = wrapper.get('[data-test="content-tags"]');
            expect(tags.text()).toContain("Category 1");
            expect(tags.text()).toContain("Topic 1");
            expect(tags.classes()).toContain("overflow-x-auto");
            expect(tags.classes()).toContain("scrollbar-hide");
            expect(tags.classes()).toContain("sm:hidden");
        });
    });

    it("shows one batch initially and reveals the next when the sentinel intersects", async () => {
        const wrapper = mountList(makeItems(20));

        expect(wrapper.findAll("li")).toHaveLength(8);

        intersect([{ isIntersecting: true }]);
        await nextTick();
        expect(wrapper.findAll("li")).toHaveLength(16);

        intersect([{ isIntersecting: true }]);
        await nextTick();
        expect(wrapper.findAll("li")).toHaveLength(20);

        // Fully revealed — further intersections change nothing.
        intersect([{ isIntersecting: true }]);
        await nextTick();
        expect(wrapper.findAll("li")).toHaveLength(20);
    });
});
