import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, beforeEach, expect, vi, vitest, beforeAll, afterEach } from "vitest";
import VideoPage from "./VideoPage.vue";
import * as auth from "@/auth";
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
import PinnedVideo from "@/components/VideoPage/PinnedVideo.vue";
import UnpinnedVideo from "@/components/VideoPage/UnpinnedVideo.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());
vi.mock("vue-router");
vi.mock("@/router", () => ({
    default: {},
    getRouteHistory: () => ({ value: [] }),
    markInternalNavigation: vi.fn(),
    isExternalNavigation: vi.fn(),
}));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("VideoPage.vue", () => {
    beforeAll(async () => {
        accessMap.value = viewAccessToAllContentMap;
    });

    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        (auth as any).useAuth.mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(true),
            user: ref(null),
            loginWithRedirect: vi.fn(),
            logout: vi.fn(),
        });
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        await initLanguage();
    });

    afterEach(async () => {
        vitest.clearAllMocks();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    // Behavioral tests for pinned/unpinned video content (filtering, grouping, language, etc.)
    // are covered in PinnedVideo.spec.ts and UnpinnedVideo.spec.ts respectively.
    // These tests focus on page-level composition only.

    it("renders the PinnedVideo child component", async () => {
        const wrapper = mount(VideoPage);

        await waitForExpect(() => {
            expect(wrapper.findComponent(PinnedVideo).exists()).toBe(true);
        });
    });

    it("renders the UnpinnedVideo child component", async () => {
        const wrapper = mount(VideoPage);

        await waitForExpect(() => {
            expect(wrapper.findComponent(UnpinnedVideo).exists()).toBe(true);
        });
    });
});
