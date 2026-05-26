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
    viewAccessToAllContentMap,
} from "@/tests/mockdata";
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

vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useAuth0: () => ({
            user: { name: "Test User", email: "test@example.com" },
            logout: vi.fn(),
            loginWithRedirect: vi.fn(),
            isAuthenticated: true,
            isLoading: false,
        }),
        authGuard: vi.fn(),
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
        vi.clearAllMocks();
    });

    // Helper function to ensure all required fields are filled for save to work
    const ensureValidFormData = async (wrapper: any) => {
        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockLanguageDtoEng.name);
        });

        // Ensure name is valid
        if (!wrapper.vm.editable.name || wrapper.vm.editable.name.trim() === "") {
            wrapper.vm.editable.name = "Valid Language Name";
        }

        // Ensure language code is valid
        if (!wrapper.vm.editable.languageCode || wrapper.vm.editable.languageCode.trim() === "") {
            wrapper.vm.editable.languageCode = "xx";
        }

        // Ensure average reading speed is valid (> 0)
        if (
            !wrapper.vm.editable.averageReadingSpeed ||
            wrapper.vm.editable.averageReadingSpeed <= 0
        ) {
            wrapper.vm.editable.averageReadingSpeed = 200;
        }

        await wrapper.vm.$nextTick();
    };

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

        await ensureValidFormData(wrapper);

        // Find textareas and set their values
        const currentLanguage = wrapper.findAll("input");

        // Update language name and code
        await currentLanguage[0].setValue("English (updated)");
        await currentLanguage[1].setValue("eng (updated)");

        // Trigger save action
        await wrapper.find('[data-test="save-button"]').trigger("click");

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

        await ensureValidFormData(wrapper);

        // Wait for the textareas and buttons to be available in the DOM
        const keytextarea = wrapper.find("[data-test='key-input']");
        const valuetextarea = wrapper.find("[data-test='value-input']");
        const addButton = wrapper.find("[data-test='add-key-button']");
        const saveButton = wrapper.find("[data-test='save-button']");

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

        await ensureValidFormData(wrapper);

        const translationRow = wrapper
            .findAll('[data-test="translation-row"]')
            .find((r) => r.html().includes("bookmarks.empty_page"));
        if (!translationRow) throw new Error("Translation row not found");

        const keyInput = translationRow.find('[data-test="edit-key-input"]');
        await keyInput.setValue("bookmarks.empty_page_updated");
        await wrapper.find("[data-test='save-button']").trigger("click");

        await waitForExpect(async () => {
            const updatedLanguage = (
                await db.docs.where({ _id: mockLanguageDtoEng._id }).toArray()
            )[0] as LanguageDto;

            expect(updatedLanguage.translations).toHaveProperty("bookmarks.empty_page_updated");
        });
    });

    it("translation strings: can edit a value", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        await ensureValidFormData(wrapper);

        const translationRow = wrapper
            .findAll('[data-test="translation-row"]')
            .find((r) => r.html().includes("bookmarks.empty_page"));
        if (!translationRow) throw new Error("Translation row not found");

        const valueInput = translationRow.find('[data-test="edit-value-input"]');
        await valueInput.setValue("You should try this!");
        await wrapper.find("[data-test='save-button']").trigger("click");

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

    it("user cannot add translation without create or edit permission: add UI is hidden and inputs disabled", async () => {
        accessMap.value = viewAccessToAllContentMap as typeof accessMap.value;

        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockLanguageDtoEng.name);
        });

        const addButton = wrapper.find("button[data-test='add-key-button']");
        expect(addButton.exists()).toBe(false);

        const keyInput = wrapper.find("input[data-test='key-input']");
        const valueInput = wrapper.find("input[data-test='value-input']");

        expect(keyInput.exists()).toBe(true);
        expect(valueInput.exists()).toBe(true);

        expect(keyInput.attributes("disabled")).toBeDefined();
        expect(valueInput.attributes("disabled")).toBeDefined();
    });

    it("can update average reading speed", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        await ensureValidFormData(wrapper);

        const readingSpeedInput = wrapper.find('input[name="averageReadingSpeed"]');
        await readingSpeedInput.setValue(250);
        await wrapper.find('[data-test="save-button"]').trigger("click");

        await waitForExpect(async () => {
            const updatedLanguage = (
                await db.docs.where({ _id: mockLanguageDtoEng._id }).toArray()
            )[0] as LanguageDto;
            expect(updatedLanguage.averageReadingSpeed).toBe(250);
        });
    });

    it("should not save if language code is empty", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockLanguageDtoEng.name);
        });

        // Find the language code input and clear it
        const inputs = wrapper.findAll("input");
        const codeInput = inputs.find((input) => input.attributes("name") === "languageCode");
        await codeInput?.setValue("");

        // Try to save
        await wrapper.find('[data-test="save-button"]').trigger("click");

        // Verify the language code is still empty (not saved)
        await waitForExpect(async () => {
            const language = (
                await db.docs.where({ _id: mockLanguageDtoEng._id }).toArray()
            )[0] as LanguageDto;

            expect(language.languageCode).toBe(mockLanguageDtoEng.languageCode);
        });
    });

    it("should not save if language name is empty", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockLanguageDtoEng.name);
        });

        // Find the language name input and clear it
        const inputs = wrapper.findAll("input");
        const nameInput = inputs.find((input) => input.attributes("name") === "languageName");
        await nameInput?.setValue("");

        // Try to save
        await wrapper.find('[data-test="save-button"]').trigger("click");

        // Verify the language name is still the original (not saved)
        await waitForExpect(async () => {
            const language = (
                await db.docs.where({ _id: mockLanguageDtoEng._id }).toArray()
            )[0] as LanguageDto;

            expect(language.name).toBe(mockLanguageDtoEng.name);
        });
    });

    it("should set the average reading speed to 200 if it is equal to 0", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockLanguageDtoEng.name);
        });

        // Find the reading speed input and set it to 0
        const readingSpeedInput = wrapper.find('input[name="averageReadingSpeed"]');
        await readingSpeedInput.setValue(0);

        // Try to save
        await wrapper.find('[data-test="save-button"]').trigger("click");

        // Verify the reading speed is set to 200 in the database
        await waitForExpect(async () => {
            const language = (
                await db.docs.where({ _id: mockLanguageDtoEng._id }).toArray()
            )[0] as LanguageDto;

            expect(language.averageReadingSpeed).toBe(200);
        });
    });
});
