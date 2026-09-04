import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, nextTick, onMounted, onUnmounted, ref } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import SingleContent from "../SingleContent.vue";
import {
    mockPostDto,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
} from "@/tests/mockdata";
import { db, isConnected, type ContentDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef, cmsLanguages } from "@/globalConfig";
import * as auth from "@/auth";

// Mirrors the mangoToDexie/queryRemote mocks the sibling specs install: a per-file
// vi.mock of "luminary-shared" replaces the global vitest.setup.ts one rather than
// merging with it.
const queryRemoteMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    const mangoToDexieMock = async <T>(
        table: { filter: (fn: (d: unknown) => boolean) => { toArray(): Promise<T[]> } },
        query: {
            selector: unknown;
            $sort?: Array<Record<string, "asc" | "desc">>;
            $limit?: number;
        },
    ) => {
        const pred = actual.mangoCompile(
            query.selector as Parameters<typeof actual.mangoCompile>[0],
        );
        let result = await table.filter((doc: unknown) => pred(doc)).toArray();
        const sort = Array.isArray(query?.$sort) ? query.$sort[0] : undefined;
        if (sort) {
            const [field, dir] = Object.entries(sort)[0] ?? [];
            if (field != null) {
                const mult = dir === "desc" ? -1 : 1;
                result = [...result].sort((a, b) => {
                    const va = (a as Record<string, unknown>)[field] as number;
                    const vb = (b as Record<string, unknown>)[field] as number;
                    return mult * (va - vb);
                });
            }
        }
        const limit = typeof query?.$limit === "number" ? query.$limit : undefined;
        return (limit != null ? result.slice(0, limit) : result) as T[];
    };
    return new Proxy(actual, {
        get(target, prop) {
            if (prop === "mangoToDexie") return mangoToDexieMock;
            if (prop === "queryRemote") return queryRemoteMock;
            return Reflect.get(target, prop);
        },
    });
});

const routeReplaceMock = vi.hoisted(() => vi.fn());

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        //@ts-ignore
        ...actual,
        useRouter: vi.fn().mockImplementation(() => ({
            currentRoute: ref({ name: "content", params: { slug: "post-a" } }),
            replace: routeReplaceMock,
            back: vi.fn(),
            resolve: vi.fn().mockImplementation((to: any) => {
                if (typeof to === "string") return { href: to } as any;
                const slug = to?.params?.slug ? `/${to.params.slug}` : "";
                return { href: `/${to?.name ?? ""}${slug}` } as any;
            }),
            getRoutes: vi.fn().mockReturnValue([]),
        })),
    };
});

vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

// Records the video source each player instance was built with, so a reused instance
// (one that never re-ran its source setup for the new document) is visible to the test.
const playerMounts: string[] = [];
const playerUnmounts: string[] = [];
vi.mock("@/components/content/VideoPlayer.vue", () => ({
    default: defineComponent({
        name: "VideoPlayer",
        props: { content: { type: Object, required: true }, language: { type: String } },
        setup(props) {
            const source = props.content.video as string;
            onMounted(() => playerMounts.push(source));
            onUnmounted(() => playerUnmounts.push(source));
            return () => null;
        },
    }),
}));

const videoPostA: ContentDto = {
    ...mockEnglishContentDto,
    _id: "content-post-a",
    parentId: "post-a",
    slug: "post-a",
    title: "Post A",
    video: "https://example.com/post-a.m3u8",
};

const fraPostA: ContentDto = {
    ...mockFrenchContentDto,
    _id: "content-post-a-fra",
    parentId: "post-a",
    slug: "post-a-fra",
    title: "Post A",
};

const videoPostB: ContentDto = {
    ...mockEnglishContentDto,
    _id: "content-post-b",
    parentId: "post-b",
    slug: "post-b",
    title: "Post B",
    video: "https://example.com/post-b.m3u8",
};

describe("SingleContent navigation between posts", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
        playerMounts.length = 0;
        playerUnmounts.length = 0;
        queryRemoteMock.mockClear();
        routeReplaceMock.mockClear();
        localStorage.clear();

        appLanguageIdsAsRef.value = ["lang-eng"];
        cmsLanguages.value = [mockLanguageDtoEng, mockLanguageDtoFra];

        await db.docs.bulkPut([
            mockPostDto,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
            videoPostA,
            videoPostB,
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

    afterEach(async () => {
        await db.docs.clear();
        isConnected.value = false;
        appLanguageIdsAsRef.value = ["lang-eng"];
        queryRemoteMock.mockReset().mockResolvedValue([]);
    });

    it("never renders the previous post while the new slug's query is in flight", async () => {
        const wrapper = mount(SingleContent, { props: { slug: "post-a" } });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Post A");
        });

        await wrapper.setProps({ slug: "post-b" });
        await nextTick();

        expect(wrapper.text()).not.toContain("Post A");

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Post B");
        });
        expect(wrapper.text()).not.toContain("Post A");

        wrapper.unmount();
    });

    it("does not navigate to the previous post's translation when a post is opened cold", async () => {
        // A second published translation is what gives the language switcher a slug it
        // could auto-navigate to.
        await db.docs.bulkPut([fraPostA]);

        const first = mount(SingleContent, { props: { slug: "post-a" } });
        await waitForExpect(() => {
            expect(first.find("[data-test='translationSelector']").exists()).toBe(true);
        });
        first.unmount();

        // A fresh instance, as the router's per-path key gives every post: its siblings
        // query seeds from the shape-keyed cache entry post-a just wrote.
        routeReplaceMock.mockClear();
        const second = mount(SingleContent, { props: { slug: "post-b" } });

        await waitForExpect(() => {
            expect(second.text()).toContain("Post B");
        });
        expect(routeReplaceMock).not.toHaveBeenCalled();

        second.unmount();
    });

    it("builds a new video player for the post navigated to", async () => {
        const wrapper = mount(SingleContent, { props: { slug: "post-a" } });

        await waitForExpect(() => {
            expect(playerMounts).toEqual([videoPostA.video]);
        });

        await wrapper.setProps({ slug: "post-b" });

        await waitForExpect(() => {
            expect(playerMounts).toEqual([videoPostA.video, videoPostB.video]);
        });
        expect(playerUnmounts).toContain(videoPostA.video);

        wrapper.unmount();
    });

    it("builds a new video player when switching to another translation in place", async () => {
        // Translations of one post: the slug prop never changes on a language switch, so
        // the player is only rebuilt if its identity follows the content document.
        await db.docs.bulkPut([
            { ...mockEnglishContentDto, video: "https://example.com/eng.m3u8" } as ContentDto,
            { ...mockFrenchContentDto, video: "https://example.com/fra.m3u8" } as ContentDto,
        ]);

        const wrapper = mount(SingleContent, { props: { slug: mockEnglishContentDto.slug } });

        // The sibling translations must be loaded before the language flip: the switcher
        // only swaps when it can resolve the preferred translation.
        await waitForExpect(() => {
            expect(playerMounts).toEqual(["https://example.com/eng.m3u8"]);
            expect(wrapper.find("[data-test='translationSelector']").exists()).toBe(true);
        });

        appLanguageIdsAsRef.value = ["lang-fra", "lang-eng"];
        await flushPromises();

        await waitForExpect(() => {
            expect(playerMounts).toEqual([
                "https://example.com/eng.m3u8",
                "https://example.com/fra.m3u8",
            ]);
        });

        wrapper.unmount();
    });
});
