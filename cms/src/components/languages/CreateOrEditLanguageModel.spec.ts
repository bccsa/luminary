import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import CreateOrEditLanguageModal from "./CreateOrEditLanguageModal.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db } from "luminary-shared";
import {
    fullAccessToAllContentMap,
    mockGroupDtoPrivateContent,
    mockGroupDtoPublicContent,
    mockGroupDtoPublicUsers,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
} from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import LButton from "../button/LButton.vue";

describe("CreateOrEditLanguageModal.vue", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await db.docs.bulkPut([
            mockGroupDtoPrivateContent,
            mockGroupDtoPublicUsers,
            mockGroupDtoPublicContent,
        ]);

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

            expect(wrapper.html()).toContain("Create new language");
            expect(inputLanguageName.value).toBe("");

            // check if the button has the right text
            expect(wrapper.html()).toContain("Create");
        });

        it("can enable save button if form fields are filled", async () => {
            const wrapper = mount(CreateOrEditLanguageModal, {
                props: {
                    isVisible: true,
                    language: mockLanguageDtoEng,
                },
            });

            const saveButton = wrapper.findAllComponents(LButton)[1];

            await waitForExpect(() => {
                expect(saveButton.props("disabled")).toBe(false);
            });
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

            expect(wrapper.html()).toContain("Edit language");
            expect(inputLanguageName.value).toBe("English");

            // check if the button has the right text
            expect(wrapper.html()).toContain("Save Changes");
        });
    });

    it("disables save button if form fields are not filled", async () => {
        const wrapper = mount(CreateOrEditLanguageModal, {
            props: {
                isVisible: true,
            },
        });

        // Clear the input fields to simulate an empty form
        await wrapper.find("[name='languageName']").setValue("");
        await wrapper.find("[name='languageCode']").setValue("");

        // Assert that the save button is disabled
        const saveButton = wrapper.findAllComponents(LButton)[1];

        await waitForExpect(() => {
            expect(saveButton.props("disabled")).toBe(true);
        });
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
