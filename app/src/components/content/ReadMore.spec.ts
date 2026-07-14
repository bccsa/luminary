import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ReadMore, { type ReadMoreItem } from "./ReadMore.vue";

// Capture the observer callback so tests can simulate the mobile infinite-scroll
// sentinel entering the viewport (jsdom has no layout, so it never fires on its own).
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
});

const makeItem = (overrides: Partial<ReadMoreItem> = {}): ReadMoreItem => ({
    content: {
        _id: "content-1",
        slug: "post-1",
        title: "A short title",
        summary: "A short summary",
        publishDate: 1_700_000_000_000,
        parentId: "post-1",
    } as any,
    tags: [],
    ...overrides,
});

const mountList = (items: ReadMoreItem[]) =>
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
    it("shows every tag when there are only a few", () => {
        const wrapper = mountList([makeItem({ tags: ["Category 1", "Topic A"] })]);

        expect(wrapper.text()).toContain("Category 1");
        expect(wrapper.text()).toContain("Topic A");
        expect(wrapper.text()).not.toContain("+");
    });

    it("collapses extra tags into a +N chip", () => {
        const wrapper = mountList([
            makeItem({ tags: ["Category 1", "Topic A", "Topic B", "Topic C"] }),
        ]);

        // First two are shown, the remaining two are summarised as "+2".
        expect(wrapper.text()).toContain("Category 1");
        expect(wrapper.text()).toContain("Topic A");
        expect(wrapper.text()).not.toContain("Topic B");
        expect(wrapper.text()).not.toContain("Topic C");
        expect(wrapper.text()).toContain("+2");
    });

    it("keeps the title to a single truncated line", () => {
        const wrapper = mountList([makeItem({ content: { ...makeItem().content, title: "T" } })]);

        expect(wrapper.get("h3").classes()).toContain("truncate");
    });

    const makeItems = (count: number): ReadMoreItem[] =>
        Array.from({ length: count }, (_, i) =>
            makeItem({
                content: {
                    ...makeItem().content,
                    _id: `content-${i}`,
                    slug: `post-${i}`,
                    title: `Post ${i}`,
                } as ReadMoreItem["content"],
            }),
        );

    it("renders every card for the desktop row but only one batch on mobile", () => {
        const wrapper = mountList(makeItems(20));

        const cards = wrapper.findAll("li");
        expect(cards).toHaveLength(20);
        // The first batch is visible everywhere...
        expect(cards[7].classes()).not.toContain("hidden");
        // ...the rest are hidden on mobile only (still shown from tablet up).
        expect(cards[8].classes()).toContain("hidden");
        expect(cards[8].classes()).toContain("sm:block");
    });

    it("reveals the next mobile batch when the sentinel intersects", async () => {
        const wrapper = mountList(makeItems(20));

        intersect([{ isIntersecting: true }]);
        await nextTick();
        expect(wrapper.findAll("li")[15].classes()).not.toContain("hidden");
        expect(wrapper.findAll("li")[16].classes()).toContain("hidden");

        intersect([{ isIntersecting: true }]);
        await nextTick();
        const cards = wrapper.findAll("li");
        expect(cards.every((card) => !card.classes().includes("hidden"))).toBe(true);

        // Fully revealed — further intersections change nothing.
        intersect([{ isIntersecting: true }]);
        await nextTick();
        expect(wrapper.findAll("li")).toHaveLength(20);
    });
});
