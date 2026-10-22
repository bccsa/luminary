import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { computed, ref } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import waitForExpect from "wait-for-expect";
import { db, isConnected, type ContentDto } from "luminary-shared";
import SingleContent from "../SingleContent.vue";
import {
    mockPostDto,
    mockCategoryDto,
    mockTopicDto,
    mockTopicContentDto,
    mockCategoryContentDto,
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
} from "@/tests/mockdata";
import { appLanguageIdsAsRef } from "@/globalConfig";
import * as auth from "@/auth";

vi.mock("vue-router", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useRouter: () => ({
        currentRoute: ref({ name: "content", params: {} }),
        replace: vi.fn(),
        push: vi.fn(),
        back: vi.fn(),
        resolve: (to: { params: { slug: string } }) => ({
            href: `/${to.params.slug}`,
            fullPath: `/${to.params.slug}`,
        }),
        getRoutes: () => [],
    }),
}));
vi.mock("@/router", () => ({
    isExternalNavigation: () => false,
    markInternalNavigation: vi.fn(),
}));
vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({ bucketBaseUrl: computed(() => "https://bucket.example.com") }),
    useStorageBuckets: () => ref([]),
}));
// A desktop viewport: the page used to embed the player here.
vi.mock("@vueuse/core", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useMediaQuery: () => ref(true),
}));

const videoContent = { ...mockEnglishContentDto, video: "test-video.mp4" } as ContentDto;

describe("SingleContent with video on a desktop", () => {
    let wrapper: VueWrapper | undefined;

    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
        localStorage.clear();
        isConnected.value = false;
        appLanguageIdsAsRef.value = ["lang-eng"];
        await db.docs.bulkPut([
            mockPostDto,
            mockCategoryDto,
            mockTopicDto,
            mockTopicContentDto,
            mockCategoryContentDto,
            videoContent,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
        ]);
        setActivePinia(createTestingPinia());
        (auth as any).useAuth.mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(false),
            user: ref(null),
            loginWithRedirect: vi.fn(),
            logout: vi.fn(),
        });
    });

    afterEach(() => {
        wrapper?.unmount();
        wrapper = undefined;
    });

    it("shows the picture and the media button, as on a phone, and no player of its own", async () => {
        wrapper = mount(SingleContent, { props: { slug: videoContent.slug } });

        await waitForExpect(() => {
            expect(wrapper!.find("[data-test='mediaWatch']").exists()).toBe(true);
            expect(wrapper!.html()).toContain("test-image.webp");
        });
        expect(wrapper!.findComponent({ name: "VideoPlayer" }).exists()).toBe(false);
        expect(wrapper!.find("aside").exists()).toBe(false);
    });
});
