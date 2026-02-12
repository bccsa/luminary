import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, beforeEach, expect, vi, vitest, beforeAll, afterEach } from "vitest";
import ExplorePage from "./ExplorePage.vue";
import * as auth0 from "@auth0/auth0-vue";
import { accessMap, db } from "luminary-shared";
import { ref } from "vue";
import {
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    viewAccessToAllContentMap,
} from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { initLanguage } from "@/globalConfig";
import PinnedTopics from "@/components/ExplorePage/PinnedTopics.vue";
import UnpinnedTopics from "@/components/ExplorePage/UnpinnedTopics.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

vi.mock("@auth0/auth0-vue", () => ({
    useAuth0: () => ({
        isAuthenticated: ref(true),
    }),
}));
vi.mock("vue-router");

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("ExplorePage.vue", () => {
    beforeAll(async () => {
        accessMap.value = viewAccessToAllContentMap;
    });

    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(true),
        });
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await initLanguage();
    });

    afterEach(async () => {
        vitest.clearAllMocks();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    // Behavioral tests for pinned/unpinned topic content (filtering, grouping, language, etc.)
    // are covered in PinnedTopics.spec.ts and UnpinnedTopics.spec.ts respectively.
    // These tests focus on page-level composition only.

    it("renders the PinnedTopics child component", async () => {
        const wrapper = mount(ExplorePage);

        await waitForExpect(() => {
            expect(wrapper.findComponent(PinnedTopics).exists()).toBe(true);
        });
    });

    it("renders the UnpinnedTopics child component", async () => {
        const wrapper = mount(ExplorePage);

        await waitForExpect(() => {
            expect(wrapper.findComponent(UnpinnedTopics).exists()).toBe(true);
        });
    });
});
