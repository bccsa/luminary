import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import PostOverview from "./PostOverview.vue";
import { usePostStore } from "@/stores/post";
import EmptyState from "@/components/EmptyState.vue";
import { mockLanguageEng, mockPost } from "@/tests/mockData";
import LBadge from "@/components/common/LBadge.vue";
import { useLanguageStore } from "@/stores/language";
import { setActivePinia } from "pinia";
import { useLocalChangeStore } from "@/stores/localChanges";
import { RouterLinkStub } from "@vue/test-utils";

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

        const wrapper = mount(PostOverview, {
            global: { stubs: { RouterLink: RouterLinkStub } },
        });

        expect(wrapper.html()).toContain("English translation title");

        // Assert there is a badge that indicates a published translation
        const badge = await wrapper.findComponent(LBadge);
        expect(badge.props().variant).toBe("success");
    });

    it("displays a badge for a post with local unsynced changes", async () => {
        const postStore = usePostStore();
        const languageStore = useLanguageStore();
        const localChangeStore = useLocalChangeStore();

        postStore.posts = [mockPost];
        languageStore.languages = [mockLanguageEng];
        // @ts-expect-error - Property is read-only but we are mocking it
        localChangeStore.isLocalChange = () => true;

        const wrapper = mount(PostOverview, {
            global: { stubs: { RouterLink: RouterLinkStub } },
        });

        // Assert there is a badge that indicates a post has unsynced local changes
        const badge = wrapper.findComponent(LBadge);
        expect(badge.props().variant).toBe("warning");
        expect(wrapper.text()).toContain("Offline changes");
    });

    it("displays an empty state if there are no posts", async () => {
        const store = usePostStore();
        store.posts = [];

        const wrapper = mount(PostOverview, {
            global: { stubs: { RouterLink: RouterLinkStub } },
        });

        expect(wrapper.findComponent(EmptyState).exists()).toBe(true);
    });

    it("doesn't display anything when the db is still loading", async () => {
        const wrapper = mount(PostOverview, {
            global: { stubs: { RouterLink: RouterLinkStub } },
        });

        expect(wrapper.find("button").exists()).toBe(false);
        expect(wrapper.findComponent(EmptyState).exists()).toBe(false);
    });

    it("can handle empty content", async () => {
        const postStore = usePostStore();
        const post = {
            ...mockPost,
            content: [],
        };

        postStore.posts = [post];

        const wrapper = mount(PostOverview, {
            global: { stubs: { RouterLink: RouterLinkStub } },
        });

        expect(wrapper.html()).toContain("No translation");
    });
});
