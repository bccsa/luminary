import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
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
import { isContentSwap, clearSwaps } from "@/util/playerSwap";
import * as auth from "@/auth";

const pushMock = vi.hoisted(() => vi.fn());
const playerMounts = vi.hoisted(() => ({ count: 0 }));

const NEXT_DOC = vi.hoisted(
    () =>
        ({
            _id: "content-next-eng",
            parentId: "post-next",
            slug: "next-slug",
            title: "The next video",
            publishDate: 1704114000000,
        }) as unknown as ContentDto,
);

vi.mock("vue-router", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useRouter: () => ({
        currentRoute: ref({ name: "content", params: {} }),
        replace: vi.fn(),
        push: pushMock,
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
// A desktop viewport, where the player is embedded in the page.
vi.mock("@vueuse/core", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useMediaQuery: () => ref(true),
}));
vi.mock("@/media-player/useUpNext", () => ({
    useUpNext: () => computed(() => ({ next: [NEXT_DOC], related: [], tags: [] })),
}));

// Records what the page hands the embedded player and how often the player is created.
vi.mock("@/components/content/VideoPlayer.vue", async () => {
    const { defineComponent, h, onMounted } = await import("vue");
    return {
        default: defineComponent({
            name: "VideoPlayer",
            props: ["content", "language", "startAudio", "autoplay", "nextUp", "windowedControls"],
            emits: ["nextupselect"],
            setup(props) {
                onMounted(() => playerMounts.count++);
                return () => h("div", { class: "player-stub" }, props.content?._id);
            },
        }),
    };
});

const videoContent = { ...mockEnglishContentDto, video: "test-video.mp4" } as ContentDto;
const otherVideoContent = {
    ...mockEnglishContentDto,
    _id: "content-other-eng",
    slug: "other-slug",
    video: "other-video.mp4",
} as ContentDto;

describe("SingleContent next video", () => {
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
            otherVideoContent,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
        ]);
        setActivePinia(createTestingPinia());
        pushMock.mockReset();
        playerMounts.count = 0;
        clearSwaps();
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

    const player = () => wrapper!.findComponent({ name: "VideoPlayer" });

    async function mountPage(slug = videoContent.slug) {
        wrapper = mount(SingleContent, { props: { slug } });
        await waitForExpect(() => expect(player().exists()).toBe(true));
    }

    it("hands the embedded player the videos to offer, without autoplay", async () => {
        await mountPage();
        expect(player().props("nextUp")).toMatchObject([
            { id: "content-next-eng", title: "The next video" },
        ]);
        expect(player().props("autoplay")).toBe(false);
    });

    it("moves to the next video's page when the player picks it, and starts it on its own", async () => {
        await mountPage();
        player().vm.$emit("nextupselect", "content-next-eng");
        await flushPromises();
        expect(pushMock).toHaveBeenCalledWith({ name: "content", params: { slug: "next-slug" } });
        // The page is kept (so is the player in it) for exactly this navigation.
        expect(isContentSwap("/next-slug")).toBe(true);
        expect(isContentSwap("/other-slug")).toBe(false);
    });

    it("ignores a pick that is not the offered video", async () => {
        await mountPage();
        player().vm.$emit("nextupselect", "something-else");
        await flushPromises();
        expect(pushMock).not.toHaveBeenCalled();
    });

    it("keeps the same player when the slug changes, and autoplays only the swapped-to video", async () => {
        await mountPage();
        player().vm.$emit("nextupselect", "content-next-eng");
        await flushPromises();
        await wrapper!.setProps({ slug: NEXT_DOC.slug });
        expect(player().props("autoplay")).toBe(true);

        await wrapper!.setProps({ slug: otherVideoContent.slug });
        await waitForExpect(() =>
            expect(player().props("content")._id).toBe(otherVideoContent._id),
        );
        expect(player().props("autoplay")).toBe(false);
        expect(playerMounts.count).toBe(1);
    });
});
