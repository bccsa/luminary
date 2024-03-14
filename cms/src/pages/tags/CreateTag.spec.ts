import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import CreateTag from "./CreateTag.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { useLanguageStore } from "@/stores/language";
import { mockLanguageEng, mockLanguageFra } from "@/tests/mockData";
import { useTagStore } from "@/stores/tag";
import { flushPromises } from "@vue/test-utils";
import waitForExpect from "wait-for-expect";
import { TagType } from "@/types";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    resolve: vi.fn(),
    useRouter: vi.fn().mockImplementation(() => ({
        replace: routePushMock,
    })),
    useRoute: vi.fn().mockImplementation(() => ({
        params: {
            tagType: TagType.AudioPlaylist,
        },
    })),
}));

describe("CreateTag", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());

        const languageStore = useLanguageStore();
        languageStore.languages = [mockLanguageEng, mockLanguageFra];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders the entity name", async () => {
        const wrapper = mount(CreateTag);

        expect(wrapper.text()).toContain("audio playlist");
    });

    it("can submit the form", async () => {
        const tagStore = useTagStore();

        const wrapper = mount(CreateTag);

        await wrapper.find("input[name='image']").setValue("testImage");
        await wrapper.findAll("button[data-test='language']")[0].trigger("click"); // English
        await wrapper.find("input[name='title']").setValue("testTitle");

        await wrapper.find("form").trigger("submit.prevent");

        await flushPromises();
        await waitForExpect(() => {
            expect(tagStore.createTag).toHaveBeenCalled();
            expect(routePushMock).toHaveBeenCalled();
        });
    });
});
