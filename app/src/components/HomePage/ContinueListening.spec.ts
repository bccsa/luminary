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

/**
 * Helper: set localStorage "mediaProgress" to a list of listened content IDs.
 */
function setMediaProgress(contentIds: string[]) {
    const entries = contentIds.map((contentId) => ({
        mediaId: `media-${contentId}`,
        contentId,
    }));
    localStorage.setItem("mediaProgress", JSON.stringify(entries));
}

describe("ContinueListening", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
        localStorage.clear();

        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id];

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
        localStorage.clear();
    });

    it("renders without errors", () => {
        const wrapper = mount(ContinueListening);
        expect(wrapper.exists()).toBe(true);
    });

    it("does not render when there is no listened content", async () => {
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
            // Component should not render HorizontalContentTileCollection
            expect(wrapper.html()).toBe("<!--v-if-->");
        });
    });

    it("displays listened content that is published", async () => {
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
        setMediaProgress([audioContent._id]);

        const wrapper = mount(ContinueListening);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(audioContent.title);
        });
    });

    it("does not render when there is no media progress", async () => {
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
        // No media progress set in localStorage

        const wrapper = mount(ContinueListening);

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain(audioContent.title);
            expect(wrapper.html()).toBe("<!--v-if-->");
        });
    });

    it("filters out video content", async () => {
        // mockEnglishContentDto has video/hlsUrl, so it is video content
        const videoContent = {
            ...mockEnglishContentDto,
            _id: "content-video",
        };
        await db.docs.bulkPut([videoContent]);
        setMediaProgress([videoContent._id]);

        const wrapper = mount(ContinueListening);

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain(videoContent.title);
            expect(wrapper.html()).toBe("<!--v-if-->");
        });
    });

    it("cleans up event listeners and intervals on unmount", () => {
        const removeEventSpy = vi.spyOn(window, "removeEventListener");
        const clearIntervalSpy = vi.spyOn(window, "clearInterval");

        const wrapper = mount(ContinueListening);
        wrapper.unmount();

        expect(removeEventSpy).toHaveBeenCalledWith("storage", expect.any(Function));
        expect(clearIntervalSpy).toHaveBeenCalled();
    });
});
