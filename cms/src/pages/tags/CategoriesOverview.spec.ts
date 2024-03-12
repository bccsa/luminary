import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import CategoriesOverview from "./CategoriesOverview.vue";
import EmptyState from "@/components/EmptyState.vue";
import { mockCategory, mockLanguageEng } from "@/tests/mockData";
import { useLanguageStore } from "@/stores/language";
import { setActivePinia } from "pinia";
import { useTagStore } from "@/stores/tag";

describe("CategoriesOverview", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays posts from the store", async () => {
        const tagStore = useTagStore();
        const languageStore = useLanguageStore();

        // @ts-ignore Property is readonly
        tagStore.tags = [mockCategory];
        // @ts-ignore Property is readonly
        tagStore.categories = [mockCategory];
        languageStore.languages = [mockLanguageEng];

        const wrapper = mount(CategoriesOverview);

        expect(wrapper.html()).toContain("Category 1");
    });

    it("displays an empty state if there are no posts", async () => {
        const store = useTagStore();
        // @ts-ignore Property is readonly
        store.tags = [];
        // @ts-ignore Property is readonly
        store.categories = [];

        const wrapper = mount(CategoriesOverview);

        expect(wrapper.findComponent(EmptyState).exists()).toBe(true);
    });

    it("doesn't display anything when the db is still loading", async () => {
        const wrapper = mount(CategoriesOverview);

        expect(wrapper.find("button").exists()).toBe(false);
        expect(wrapper.findComponent(EmptyState).exists()).toBe(false);
    });
});
