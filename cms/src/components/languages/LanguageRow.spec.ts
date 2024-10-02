import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import LanguageRow from "./LanguageRow.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db } from "luminary-shared";
import { fullAccessToAllContentMap, mockLanguageDtoEng } from "@/tests/mockdata";

describe("LanguageRow.vue", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());

        accessMap.value = fullAccessToAllContentMap;
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("should display the passed language", async () => {
        const wrapper = mount(LanguageRow, {
            props: {
                languagesDoc: mockLanguageDtoEng,
            },
        });

        expect(wrapper.html()).toContain("English");
        expect(wrapper.html()).toContain("ENG");
        expect(wrapper.html()).toContain("1/1/2024, 2:00 PM"); // this test might fail if the date format changes
    });
});
