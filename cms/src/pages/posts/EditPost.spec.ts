import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import EditPost from "./EditPost.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { useLanguageStore } from "@/stores/language";
import {
    mockEnglishContent,
    mockFrenchContent,
    mockLanguageEng,
    mockLanguageFra,
    mockLanguageSwa,
    mockPost,
} from "@/tests/mockData";
import ContentForm from "@/components/content/ContentForm.vue";
import { usePostStore } from "@/stores/post";
import waitForExpect from "wait-for-expect";
import EmptyState from "@/components/EmptyState.vue";
import LanguageSelector from "@/components/content/LanguageSelector.vue";

let routeLanguage: string;

vi.mock("vue-router", () => ({
    resolve: vi.fn(),
    useRouter: vi.fn().mockImplementation(() => ({
        replace: vi.fn(),
    })),
    useRoute: vi.fn().mockImplementation(() => ({
        params: {
            postId: mockPost._id,
            language: routeLanguage,
        },
    })),
}));

const docsDb = vi.hoisted(() => {
    return {
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => ({ _id: "content-post1-eng" })),
    };
});

vi.mock("@/db/baseDatabase", () => {
    return {
        db: {
            docs: docsDb,
            localChanges: docsDb,
        },
    };
});

describe("EditPost", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());

        const languageStore = useLanguageStore();
        const postStore = usePostStore();
        languageStore.languages = [mockLanguageEng, mockLanguageFra, mockLanguageSwa];
        postStore.posts = [mockPost];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders an initial loading state", async () => {
        const postStore = usePostStore();
        postStore.posts = [];
        const wrapper = mount(EditPost);

        const form = await wrapper.findComponent(ContentForm);
        expect(form.exists()).toBe(false);
    });

    it("renders the form", async () => {
        const wrapper = mount(EditPost);

        const form = await wrapper.findComponent(ContentForm);
        expect(form.exists()).toBe(true);
    });

    it("renders an empty state when there is no content in the post", async () => {
        const postStore = usePostStore();
        postStore.posts = [
            {
                ...mockPost,
                content: [],
            },
        ];

        const wrapper = mount(EditPost);

        const emptyState = await wrapper.findComponent(EmptyState);
        expect(emptyState.exists()).toBe(true);
        const languageSelector = await wrapper.findComponent(LanguageSelector);
        expect(languageSelector.exists()).toBe(true);
        const form = await wrapper.findComponent(ContentForm);
        expect(form.exists()).toBe(false);
    });

    it("renders the title of the default language", async () => {
        const wrapper = mount(EditPost);

        expect(wrapper.text()).toContain(mockEnglishContent.title);
    });

    it("renders a different language than the default when it's not available", async () => {
        const postStore = usePostStore();
        postStore.posts = [
            {
                ...mockPost,
                content: [mockFrenchContent],
            },
        ];

        const wrapper = mount(EditPost);

        expect(wrapper.text()).toContain(mockFrenchContent.title);
    });

    it("can set the language from the route params", async () => {
        routeLanguage = "fra";

        const wrapper = mount(EditPost);

        expect(wrapper.text()).toContain(mockPost.content[1].title);

        // Reset test state
        routeLanguage = "";
    });

    it("saves the content", async () => {
        const postStore = usePostStore();
        const wrapper = mount(EditPost);

        await wrapper.find("button[data-test='publish']").trigger("click");

        await waitForExpect(() => {
            expect(postStore.updatePost).toHaveBeenCalledWith(mockEnglishContent, mockPost);
        });
    });

    it("can create a translation", async () => {
        const postStore = usePostStore();
        const wrapper = mount(EditPost);

        await wrapper.find("button[data-test='language-selector']").trigger("click");
        await wrapper.find("button[data-test='select-language-swa']").trigger("click");

        expect(postStore.createTranslation).toHaveBeenCalledWith(mockPost, mockLanguageSwa);
        // Test that it switched the current language
        expect(wrapper.text()).toContain("Swahili");
        expect(wrapper.text()).not.toContain("Français");
        expect(wrapper.text()).not.toContain("English");
    });
});
