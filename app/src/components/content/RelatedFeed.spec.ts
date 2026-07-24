import { describe, it, expect, vi } from "vitest";
import { computed } from "vue";
import { mount } from "@vue/test-utils";
import type { ContentDto } from "luminary-shared";
import RelatedFeed from "./RelatedFeed.vue";
import ReadMore from "./ReadMore.vue";
import { useRelatedFeed } from "@/composables/useRelatedFeed";

vi.mock("@/composables/useRelatedFeed", () => ({
    useRelatedFeed: vi.fn(),
}));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (key: string) => (key === "content.read_more" ? "Read more" : key) }),
}));

const makeItem = (id: string): ContentDto =>
    ({ _id: id, slug: id, title: id, parentId: `post-${id}` }) as ContentDto;

describe("RelatedFeed", () => {
    it("renders ReadMore with the merged feed's items under a Read more heading", () => {
        vi.mocked(useRelatedFeed).mockReturnValue({ items: computed(() => [makeItem("a")]) });

        const wrapper = mount(RelatedFeed, {
            props: { selectedContent: makeItem("selected"), tags: [] },
            global: { stubs: { RouterLink: true, LImage: true } },
        });

        expect(wrapper.text()).toContain("Read more");
        expect(wrapper.findComponent(ReadMore).props("items")).toEqual([makeItem("a")]);
    });

    it("renders nothing when the merged feed is empty", () => {
        vi.mocked(useRelatedFeed).mockReturnValue({ items: computed(() => []) });

        const wrapper = mount(RelatedFeed, {
            props: { selectedContent: makeItem("selected"), tags: [] },
            global: { stubs: { RouterLink: true, LImage: true } },
        });

        expect(wrapper.text()).not.toContain("Read more");
    });
});
