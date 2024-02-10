import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import PostOverview from "./PostOverview.vue";
import { usePostStore } from "@/stores/post";
import EmptyState from "@/components/EmptyState.vue";
import { mockLanguageEng, mockPost } from "@/tests/mockData";
import AcBadge from "@/components/common/AcBadge.vue";
import { useLanguageStore } from "@/stores/language";

vi.mock("vue-router", () => ({
    resolve: vi.fn(),
    RouterLink: vi.fn(),
}));

describe("PostOverview", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays posts from the store", async () => {
        const pinia = createTestingPinia();
        const postStore = usePostStore();
        const languageStore = useLanguageStore();

        postStore.posts = [mockPost];
        languageStore.languages = [mockLanguageEng];

        const wrapper = mount(PostOverview, {
            global: {
                plugins: [pinia],
            },
        });

        expect(wrapper.html()).toContain("English translation title");

        // Assert there is a badge that indicates a published translation
        const badge = await wrapper.findComponent(AcBadge);
        expect(badge.props().variant).toBe("success");
    });

    it("displays an empty state if there are no posts", async () => {
        const pinia = createTestingPinia();
        const store = usePostStore(pinia);
        store.posts = [];

        const wrapper = mount(PostOverview, {
            global: {
                plugins: [pinia],
            },
        });

        expect(wrapper.findComponent(EmptyState).exists()).toBe(true);
    });

    it("doesn't display anything when the db is still loading", async () => {
        const pinia = createTestingPinia();

        const wrapper = mount(PostOverview, {
            global: {
                plugins: [pinia],
            },
        });

        expect(wrapper.find("button").exists()).toBe(false);
        expect(wrapper.findComponent(EmptyState).exists()).toBe(false);
    });
});
