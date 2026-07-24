import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { TagType } from "luminary-shared";
import RelatedContent from "./RelatedContent.vue";
import RelatedFeed from "./RelatedFeed.vue";
import { mockEnglishContentDto, mockTopicContentDto } from "@/tests/mockdata";

let intersectCallbacks: IntersectionObserverCallback[] = [];
function triggerLazyMounts() {
    intersectCallbacks.forEach((cb) =>
        cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
    );
}

describe("RelatedContent", () => {
    beforeEach(() => {
        intersectCallbacks = [];
        window.IntersectionObserver = class {
            constructor(cb: IntersectionObserverCallback) {
                intersectCallbacks.push(cb);
            }
            observe() {}
            unobserve() {}
            disconnect() {}
        } as unknown as typeof IntersectionObserver;
    });

    it("defers mounting the related feed until it scrolls near the viewport", async () => {
        const wrapper = mount(RelatedContent, {
            props: { tags: [mockTopicContentDto], selectedContent: mockEnglishContentDto },
            global: { stubs: { RouterLink: true, LImage: true } },
        });

        expect(wrapper.findComponent(RelatedFeed).exists()).toBe(false);

        triggerLazyMounts();
        await nextTick();

        expect(wrapper.findComponent(RelatedFeed).exists()).toBe(true);
    });

    it("renders nothing on a topic page", () => {
        const wrapper = mount(RelatedContent, {
            props: {
                tags: [mockTopicContentDto],
                selectedContent: { ...mockEnglishContentDto, parentTagType: TagType.Topic },
            },
            global: { stubs: { RouterLink: true, LImage: true } },
        });
        triggerLazyMounts();

        expect(wrapper.findComponent(RelatedFeed).exists()).toBe(false);
    });
});
