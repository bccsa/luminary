import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import EditPost from "./EditPost.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { useLanguageStore } from "@/stores/language";
import {
    mockContent,
    mockEnglishContentDto,
    mockLanguageEng,
    mockLanguageFra,
    mockPost,
} from "@/tests/mockData";
import ContentForm from "@/components/content/ContentForm.vue";
import { usePostStore } from "@/stores/post";
import waitForExpect from "wait-for-expect";

vi.mock("vue-router", () => ({
    resolve: vi.fn(),
    useRoute: vi.fn().mockImplementation(() => ({
        params: {
            id: mockPost._id,
        },
    })),
}));

describe("EditPost", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());

        const languageStore = useLanguageStore();
        const postStore = usePostStore();
        languageStore.languages = [mockLanguageEng, mockLanguageFra];
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

    it("renders the title of the selected language", async () => {
        const wrapper = mount(EditPost);

        expect(wrapper.text()).toContain(mockPost.content[0].title);
    });

    it("saves the content", async () => {
        const wrapper = mount(EditPost);
        const postStore = usePostStore();

        await wrapper.findComponent(ContentForm).trigger("save", [mockContent, mockPost]);

        waitForExpect(() => {
            expect(postStore.updatePost).toHaveBeenCalledWith([mockContent, mockPost]);
        });
    });
});
