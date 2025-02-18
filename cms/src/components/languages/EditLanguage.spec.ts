import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import EditLanguage from "./EditLanguage.vue";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db, type LanguageDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { setActivePinia } from "pinia";
import {
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    superAdminAccessMap,
} from "@/tests/mockdata";
import { PlusCircleIcon } from "@heroicons/vue/20/solid";
import { ref } from "vue";

// Mock the vue router
const routeReplaceMock = vi.fn();
const currentRouteMock = ref({ fullPath: `languages/${mockLanguageDtoEng.name}` });

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: vi.fn().mockImplementation(() => ({
            currentRoute: currentRouteMock,
            replace: routeReplaceMock,
        })),
    };
});
describe("EditLanguage.vue", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        accessMap.value = superAdminAccessMap;
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

        const currentLanguage = wrapper.findAll("input");

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

        // Find textareas and set their values
        const currentLanguage = wrapper.findAll("input");

        // Wait for the language to be loaded
        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockLanguageDtoEng.name);
            expect(currentLanguage[1].element.value).toBe(mockLanguageDtoEng.languageCode);
        });

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

        // Wait for the editor to be loaded
        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockLanguageDtoEng.name);
        });

        // Wait for the textareas and buttons to be available in the DOM
        const keytextarea = wrapper.find("input[data-test='key-input']");
        const valuetextarea = wrapper.find("input[data-test='value-input']");
        const addButton = wrapper.find("button[data-test='add-key-button']");
        const saveButton = wrapper.find("button[data-test='save-button']");

        // Assert that all required elements are present
        expect(keytextarea.exists()).toBe(true);
        expect(valuetextarea.exists()).toBe(true);
        expect(addButton.exists()).toBe(true);
        expect(saveButton.exists()).toBe(true);

        // Set values for the new translation
        await keytextarea.setValue("newKey.test");
        await valuetextarea.setValue("New value");

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
            const textarea = translationRow.findAll("textarea");

            await textarea[0].setValue("bookmarks.empty_page_updated");

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
            const textarea = translationRow.findAll("textarea");

            await textarea[1].setValue("You should try this!");

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

    it("can delete a language", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        // Wait for the editor to be loaded
        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockLanguageDtoEng.name);
        });

        let deleteButton;
        await waitForExpect(async () => {
            deleteButton = wrapper.find('[data-test="delete-button"]');
            expect(deleteButton.exists()).toBe(true);
        });
        await deleteButton!.trigger("click"); // Click the delete button

        let deleteModalButton;
        await waitForExpect(async () => {
            deleteModalButton = wrapper.find('[data-test="modal-primary-button"]');
            expect(deleteModalButton.exists()).toBe(true);
        });
        await deleteModalButton!.trigger("click"); // Accept dialog

        await waitForExpect(async () => {
            const deletedLanguage = await db.docs.where({ _id: mockLanguageDtoEng._id }).toArray();

            expect(deletedLanguage.length).toBe(0);
        });
    });
});
