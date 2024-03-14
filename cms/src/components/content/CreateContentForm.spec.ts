import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import CreateContentForm from "./CreateContentForm.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { useLanguageStore } from "@/stores/language";
import { mockLanguageEng, mockLanguageFra } from "@/tests/mockData";
import { flushPromises } from "@vue/test-utils";
import waitForExpect from "wait-for-expect";

describe("CreateContentForm", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());

        const languageStore = useLanguageStore();
        languageStore.languages = [mockLanguageEng, mockLanguageFra];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders the initial form", async () => {
        const wrapper = mount(CreateContentForm, {
            props: { entityName: "post" },
        });

        expect(wrapper.html()).toContain("Default image");
        expect(wrapper.html()).toContain(mockLanguageEng.name);
        expect(wrapper.html()).toContain(mockLanguageFra.name);
        expect(wrapper.html()).not.toContain("Title");
    });

    it("shows a title field after a language is chosen", async () => {
        const wrapper = mount(CreateContentForm, {
            props: { entityName: "post" },
        });

        await wrapper.findAll("button[data-test='language']")[0].trigger("click");

        expect(wrapper.html()).toContain(mockLanguageEng.name); // In the placeholder
        expect(wrapper.html()).not.toContain(mockLanguageFra.name);
        expect(wrapper.html()).toContain("Title");
    });

    it("can reset the chosen language", async () => {
        const wrapper = mount(CreateContentForm, {
            props: { entityName: "post" },
        });

        await wrapper.findAll("button[data-test='language']")[0].trigger("click");
        await wrapper.find("button[data-test='reset']").trigger("click");

        expect(wrapper.html()).toContain(mockLanguageEng.name);
        expect(wrapper.html()).toContain(mockLanguageFra.name);
        expect(wrapper.html()).not.toContain("Title");
    });

    it("emits an event when submitting the form", async () => {
        const wrapper = mount(CreateContentForm, {
            props: { entityName: "post" },
        });

        await wrapper.find("input[name='image']").setValue("testImage");
        await wrapper.findAll("button[data-test='language']")[0].trigger("click"); // English
        await wrapper.find("input[name='title']").setValue("testTitle");

        await wrapper.find("form").trigger("submit.prevent");

        await flushPromises();
        await waitForExpect(() => {
            const saveEvent: any = wrapper.emitted("save");
            expect(saveEvent).not.toBe(undefined);
            expect(saveEvent).toHaveLength(1);

            expect(saveEvent![0][0].title).toBe("testTitle");
            expect(saveEvent![0][0].image).toBe("testImage");
            expect(saveEvent![0][0].language.languageCode).toBe("eng");
        });
    });

    it("validates the form", async () => {
        const wrapper = mount(CreateContentForm, {
            props: { entityName: "post" },
        });

        // Select a language so both fields are visible
        await wrapper.findAll("button[data-test='language']")[0].trigger("click");

        await wrapper.find("input[name='image']").setValue("");
        await wrapper.find("input[name='title']").setValue("");

        await flushPromises();
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Image is a required field");
            expect(wrapper.text()).toContain("Title is a required field");
        });
    });
});
