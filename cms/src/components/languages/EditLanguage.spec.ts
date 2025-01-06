import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import EditLanguage from "./EditLanguage.vue";
import { createTestingPinia } from "@pinia/testing";
import { useNotificationStore } from "@/stores/notification";
import { accessMap, db, type LanguageDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { setActivePinia } from "pinia";
import { mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "@/tests/mockdata";
import { fullAccessToAllContentMap } from "../../tests/mockdata";

describe("EditLanguage.vue", () => {
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

    it("should update and save the language", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        const currentLanguage = wrapper.findAll("input");

        await currentLanguage[0].setValue("English (updated)");
        await currentLanguage[1].setValue("eng (updated)");

        await wrapper.find("[data-test='save-button']").trigger("click");

        await waitForExpect(async () => {
            expect(useNotificationStore().addNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: "Language updated",
                    description: "Language updated successfully",
                    state: "success",
                }),
            );
        });

        const updatedLanguage = (
            await db.docs.where({ _id: mockLanguageDtoEng._id }).toArray()
        )[0] as LanguageDto;

        expect(updatedLanguage.name).toBe("English (updated)");
        expect(updatedLanguage.languageCode).toBe("eng (updated)");
    });

    it("translation strings: can add a new translation", async () => {
        const wrapper = mount(EditLanguage, {
            props: {
                id: mockLanguageDtoEng._id,
            },
        });

        await waitForExpect(async () => {
            const keyInput = wrapper.find("[name='key']");
            const valueInput = wrapper.find("[name='value']");

            await keyInput.setValue("newKey.test");
            await valueInput.setValue("New value");

            await wrapper.find("[name='add']").trigger("click");
            await wrapper.find("[data-test='save-button']").trigger("click");

            expect(wrapper.html()).toContain("newKey.test");
            expect(wrapper.html()).toContain("New value");
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

            const translationRow = wrapper.findAll("tr")[3];

            await translationRow.find("[name='key-span']").trigger("click");
            await translationRow.find("[name='key']").setValue("newKey.test");

            await translationRow.find("[data-test='save-key-button']").trigger("click");
            await wrapper.find("[data-test='save-button']").trigger("click");

            expect(wrapper.html()).toContain("newKey.test");
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

            const translationRow = wrapper.findAll("tr")[3];

            const td = translationRow.findAll("td")[1];
            await td.find("span").trigger("click");

            await td.find("input").setValue("New value");

            await translationRow.find("[data-test='save-key-button']").trigger("click");
            await wrapper.find("[data-test='save-button']").trigger("click");

            expect(wrapper.html()).toContain("New value");
        });
    });
});
