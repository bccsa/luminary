import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import EditLanguage from "./EditLanguage.vue";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db, type LanguageDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { setActivePinia } from "pinia";
import { mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "@/tests/mockdata";
import { fullAccessToAllContentMap } from "../../tests/mockdata";
import { PlusCircleIcon } from "@heroicons/vue/20/solid";

describe("EditLanguage.vue", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        accessMap.value = fullAccessToAllContentMap;
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("should display the passed language", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        const currentLanguage = wrapper.findAll("textarea");

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockLanguageDtoEng.name);
            expect(currentLanguage[1].element.value).toBe(mockLanguageDtoEng.languageCode);
        });
    });

    it("should update and save the current language", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        // Find inputs and set their values
        const currentLanguage = wrapper.findAll("textarea");

        // Update language name and code
        await currentLanguage[0].setValue("English (updated)");
        await currentLanguage[1].setValue("eng (updated)");

        // Trigger save action
        await wrapper.find("[data-test='save-button']").trigger("click");

        // Wait for the database to update
        await waitForExpect(async () => {
            const updatedLanguage = (
                await db.docs.where({ _id: mockLanguageDtoEng._id }).toArray()
            )[0] as LanguageDto;

            expect(updatedLanguage.name).toBe("English (updated)");
            expect(updatedLanguage.languageCode).toBe("eng (updated)");
        });
    });

    it("translation strings: can add a new translation", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        // Wait for the inputs and buttons to be available in the DOM
        const keyInput = wrapper.find("textarea[data-test='key-input']");
        const valueInput = wrapper.find("textarea[data-test='value-input']");
        const addButton = wrapper.find("button[data-test='add-key-button']");
        const saveButton = wrapper.find("button[data-test='save-button']");

        // Assert that all required elements are present
        expect(keyInput.exists()).toBe(true);
        expect(valueInput.exists()).toBe(true);
        expect(addButton.exists()).toBe(true);
        expect(saveButton.exists()).toBe(true);

        // Set values for the new translation
        await keyInput.setValue("newKey.test");
        await valueInput.setValue("New value");

        // Click the add button to add the new translation
        await addButton.trigger("click");

        // Save the updated language
        await saveButton.trigger("click");

        // Verify that the new translation is saved in the database
        await waitForExpect(async () => {
            const updatedLanguage = (
                await db.docs.where({ _id: mockLanguageDtoEng._id }).toArray()
            )[0] as LanguageDto;

            expect(updatedLanguage.translations).toHaveProperty("newKey.test", "New value");
        });
    });

    it("translation strings: can edit a key", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        await waitForExpect(async () => {
            expect(wrapper.html()).toContain(mockLanguageDtoEng.name);

            const translationRow = wrapper.findAll("tr")[2];
            const input = translationRow.findAll("textarea");

            await input[0].setValue("bookmarks.empty_page_updated");

            await wrapper.findComponent(PlusCircleIcon).trigger("click");
            await wrapper.find("button[data-test='save-button']").trigger("click");

            await waitForExpect(async () => {
                const updatedLanguage = (
                    await db.docs.where({ _id: mockLanguageDtoEng._id }).toArray()
                )[0] as LanguageDto;

                expect(updatedLanguage.translations).toHaveProperty("bookmarks.empty_page_updated");
            });
        });
    });

    it("translation strings: can edit a value", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        await waitForExpect(async () => {
            expect(wrapper.html()).toContain(mockLanguageDtoEng.name);

            const translationRow = wrapper.findAll("tr")[2];
            const input = translationRow.findAll("textarea");

            await input[1].setValue("You should try this!");

            await wrapper.findComponent(PlusCircleIcon).trigger("click");
            await wrapper.find("button[data-test='save-button']").trigger("click");

            await waitForExpect(async () => {
                const updatedLanguage = (
                    await db.docs.where({ _id: mockLanguageDtoEng._id }).toArray()
                )[0] as LanguageDto;

                expect(updatedLanguage.translations).toHaveProperty(
                    "bookmarks.empty_page",
                    "You should try this!",
                );
            });
        });
    });
});
