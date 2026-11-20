import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref, shallowRef } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import waitForExpect from "wait-for-expect";
import { db, type ContentDto } from "luminary-shared";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import { recordUserActivity } from "@/userActivity/store";
import ActivityAll from "../ActivityAll.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => (mockLanguageDtoEng.translations as Record<string, string>)[key] || key,
    }),
}));

// The two lookups the panel makes, answered by hand so each can be held back: posts for
// views and likes first, highlighted translations second, in the order the panel asks.
const lookups: {
    output: ReturnType<typeof shallowRef<ContentDto[]>>;
    isFetching: ReturnType<typeof ref<boolean>>;
}[] = [];
vi.mock("@/composables/useContentQuery", () => {
    const useContentQueryWithState = () => {
        const lookup = { output: shallowRef<ContentDto[]>([]), isFetching: ref(true) };
        lookups.push(lookup);
        return lookup;
    };
    return {
        useContentQueryWithState,
        useContentQuery: () => useContentQueryWithState().output,
    };
});

const viewedPost: ContentDto = {
    ...mockEnglishContentDto,
    _id: "content-viewed",
    parentId: "post-viewed",
    title: "The post read today",
};
const highlightedTranslation: ContentDto = {
    ...mockEnglishContentDto,
    _id: "content-highlighted",
    parentId: "post-highlighted",
    title: "The article highlighted earlier",
    text: "a passage",
};

const EMPTY = "Everything you read, like or highlight will show up here.";

describe("ActivityAll while its lookups load", () => {
    beforeEach(async () => {
        lookups.length = 0;
        await db.userActivity.clear();
        setActivePinia(createTestingPinia());

        await recordUserActivity(
            {
                type: "highlighted",
                contentId: highlightedTranslation._id,
                parentId: highlightedTranslation.parentId,
            },
            { ranges: [{ start: 0, end: 9, color: "yellow", text: "a passage" }] },
        );
        await recordUserActivity({ type: "viewed", parentId: viewedPost.parentId });
    });

    it("does not say there is nothing before the activity has been read", () => {
        const wrapper = mount(ActivityAll);

        expect(wrapper.text()).not.toContain(EMPTY);
    });

    it("does not show the highlights alone while the posts are still loading", async () => {
        const wrapper = mount(ActivityAll);
        const [posts, translations] = lookups;
        translations.output.value = [highlightedTranslation];
        translations.isFetching.value = false;
        // Long enough for the stored activity to be read, which is when the flash showed.
        await new Promise((resolve) => setTimeout(resolve, 200));
        await flushPromises();

        expect(wrapper.text()).not.toContain(highlightedTranslation.title);
        expect(wrapper.text()).not.toContain(EMPTY);

        posts.output.value = [viewedPost];
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(viewedPost.title);
        });
        // Newest first, all at once.
        const text = wrapper.text();
        expect(text.indexOf(viewedPost.title)).toBeLessThan(
            text.indexOf(highlightedTranslation.title),
        );
    });

    it("keeps the list on screen while a later change is looked up", async () => {
        const wrapper = mount(ActivityAll);
        const [posts, translations] = lookups;
        posts.output.value = [viewedPost];
        translations.output.value = [highlightedTranslation];
        posts.isFetching.value = translations.isFetching.value = false;
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(viewedPost.title);
        });

        posts.isFetching.value = true;
        await flushPromises();

        expect(wrapper.text()).toContain(viewedPost.title);
    });
});
