import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import CreateOrEditLanguageModal from "./CreateOrEditLanguageModal.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db } from "luminary-shared";
import {
    fullAccessToAllContentMap,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
} from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import GroupSelector from "../groups/GroupSelector.vue";
import { ComboboxInput } from "@headlessui/vue";

describe("CreateOrEditLanguageModal.vue", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);

        setActivePinia(createTestingPinia());

        accessMap.value = fullAccessToAllContentMap;
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    describe("create mode", () => {
        it("can display modal in create mode", async () => {
            const wrapper = mount(CreateOrEditLanguageModal, {
                props: {
                    isVisible: true,
                },
            });

            const inputLanguageName = wrapper.find("[name='languageName']")
                .element as HTMLInputElement;

            expect(wrapper.html()).toContain("Create New Language");
            expect(inputLanguageName.value).toBe("");

            // check if the button has the right text
            expect(wrapper.html()).toContain("Create");
        });

        it.skip("can enable save button if form fields are filled", async () => {
            const wrapper = mount(CreateOrEditLanguageModal, {
                props: {
                    isVisible: true,
                },
            });

            await wrapper.find("[name='languageName']").setValue("Afrikaans");
            await wrapper.find("[name='languageCode']").setValue("afr");

            let groupSelector: any;
            await waitForExpect(() => {
                groupSelector = wrapper.findComponent(GroupSelector);
                expect(groupSelector.exists()).toBe(true);
            });

            await groupSelector!.findComponent(ComboboxInput).setValue("Languages");

            // Assert that the save button is disabled
            const saveButton = wrapper.find("[data-test='save-button']");
            expect(saveButton.attributes("disabled")).toBeDefined();
        });
    });

    describe("edit mode", () => {
        it("can display the modal in edit mode", async () => {
            const wrapper = mount(CreateOrEditLanguageModal, {
                props: {
                    isVisible: true,
                    language: mockLanguageDtoEng,
                },
            });

            const inputLanguageName = wrapper.find("[name='languageName']")
                .element as HTMLInputElement;

            expect(wrapper.html()).toContain("Edit Language");
            expect(inputLanguageName.value).toBe("English");

            // check if the button has the right text
            expect(wrapper.html()).toContain("Save Changes");
        });
    });

    it.skip("disables save button if form fields are not filled", async () => {
        const wrapper = mount(CreateOrEditLanguageModal, {
            props: {
                isVisible: true,
            },
        });

        // Clear the input fields to simulate an empty form
        await wrapper.find("[name='languageName']").setValue("");
        await wrapper.find("[name='languageCode']").setValue("");

        // Assert that the save button is disabled
        const saveButton = wrapper.find("[data-test='save-button']");
        expect(saveButton.attributes("disabled")).toBeUndefined();
    });

    it("emits close event when cancel button is clicked", async () => {
        const wrapper = mount(CreateOrEditLanguageModal, {
            props: {
                isVisible: true,
            },
        });

        await wrapper.find("[data-test='cancel']").trigger("click");

        // Assert the close event was emitted
        expect(wrapper.emitted().close).toBeTruthy();
    });
});
