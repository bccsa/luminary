import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ReadMore, { type ReadMoreItem } from "./ReadMore.vue";

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
});
