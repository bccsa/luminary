import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import CreatePost from "./CreatePost.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { useLanguageStore } from "@/stores/language";
import { mockLanguageEng, mockLanguageFra } from "@/tests/mockData";
import { usePostStore } from "@/stores/post";
import { flushPromises } from "@vue/test-utils";
import waitForExpect from "wait-for-expect";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    resolve: vi.fn(),
    useRouter: vi.fn().mockImplementation(() => ({
        replace: routePushMock,
    })),
}));

describe("CreatePost", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());

        const languageStore = useLanguageStore();
        languageStore.languages = [mockLanguageEng, mockLanguageFra];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("can submit the form", async () => {
        const postStore = usePostStore();

        const wrapper = mount(CreatePost);

        await wrapper.find("input[name='image']").setValue("testImage");
        await wrapper.findAll("button[data-test='language']")[0].trigger("click"); // English
        await wrapper.find("input[name='title']").setValue("testTitle");

        await wrapper.find("form").trigger("submit.prevent");

        await flushPromises();
        await waitForExpect(() => {
            expect(postStore.createPost).toHaveBeenCalled();
            expect(routePushMock).toHaveBeenCalled();
        });
    });
});
