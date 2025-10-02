import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import LanguageRow from "./LanguageRow.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db } from "luminary-shared";
import { fullAccessToAllContentMap, mockLanguageDtoEng } from "@/tests/mockdata";
import { DateTime } from "luxon";

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

        expect(wrapper.html()).toContain(mockLanguageDtoEng.name);
        expect(wrapper.html()).toContain(mockLanguageDtoEng.languageCode.toUpperCase());

        // check if the updated time is formatted correctly according the systems settings
        expect(wrapper.html()).toContain(
            db
                .toDateTime(mockLanguageDtoEng.updatedTimeUtc)
                .toLocaleString(DateTime.DATETIME_SHORT),
        );
    });
});
