import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { mockEnglishContentDto, mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "@/tests/mockdata";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import ContinueListening from "./ContinueListening.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("ContinueListening", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();

        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id];

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
    });

    it("does not render when there is no listened content", async () => {
        await db.docs.bulkPut([mockEnglishContentDto]);

        const wrapper = mount(ContinueListening);

        await waitForExpect(() => {
            // Component should not render HorizontalContentTileCollection
            expect(wrapper.html()).toBe("<!--v-if-->");
        });
    });

    it("renders without errors", () => {
        const wrapper = mount(ContinueListening);
        expect(wrapper.exists()).toBe(true);
    });

    // Note: The useDexieLiveQueryWithDeps callback currently has `contentIds` hardcoded as an empty array,
    // so the query always returns [] and the component never renders content.
    // The filtering/sorting logic (lines 17-37) is unreachable until a central watch/listen/read
    // service is implemented (see TODO in source).
    it("always returns empty due to hardcoded empty contentIds (pending service implementation)", async () => {
        // Add audio-only content to the database
        const audioContent = {
            ...mockEnglishContentDto,
            _id: "content-audio",
            video: undefined,
            parentMedia: {
                ...mockEnglishContentDto.parentMedia,
                hlsUrl: undefined,
                fileCollections: [{ name: "audio.mp3" }],
            },
        };
        await db.docs.bulkPut([audioContent]);

        const wrapper = mount(ContinueListening);

        await waitForExpect(() => {
            // Even with audio content in the DB, the component renders nothing
            // because contentIds is hardcoded as empty
            expect(wrapper.html()).toBe("<!--v-if-->");
        });
    });
});
