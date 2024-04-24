import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import PostOverview from "./PostOverview.vue";
import { usePostStore } from "@/stores/post";
import EmptyState from "@/components/EmptyState.vue";
import { mockLanguageEng, mockPost, fullAccessToAllContentMap } from "@/tests/mockData";
import { useLanguageStore } from "@/stores/language";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import LButton from "@/components/button/LButton.vue";
import { nextTick } from "vue";

describe("PostOverview", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays posts from the store", async () => {
        const postStore = usePostStore();
        const languageStore = useLanguageStore();

        postStore.posts = [mockPost];
        languageStore.languages = [mockLanguageEng];

        const wrapper = mount(PostOverview);

        expect(wrapper.html()).toContain("English translation title");
    });

    it("displays an empty state if there are no posts", async () => {
        const store = usePostStore();
        store.posts = [];

        const wrapper = mount(PostOverview);

        expect(wrapper.findComponent(EmptyState).exists()).toBe(true);
    });

    it("doesn't display anything when the db is still loading", async () => {
        const wrapper = mount(PostOverview);

        expect(wrapper.find("button").exists()).toBe(false);
        expect(wrapper.findComponent(EmptyState).exists()).toBe(false);
    });

    describe("permissions", () => {
        it("doesn't display Create button if the user has no permission to create posts", async () => {
            const postStore = usePostStore();
            const userAccessStore = useUserAccessStore();
            postStore.posts = [mockPost];

            const wrapper = mount(PostOverview);

            expect(wrapper.text()).not.toContain("Create post");

            userAccessStore.accessMap = fullAccessToAllContentMap;
            await nextTick();
            expect(wrapper.text()).toContain("Create post");
        });
    });
});
