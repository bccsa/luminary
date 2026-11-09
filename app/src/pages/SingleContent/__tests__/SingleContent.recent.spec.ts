import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { ref } from "vue";
import * as auth from "@/auth";
import { appLanguageIdsAsRef } from "@/globalConfig";
import {
    mockPostDto,
    mockCategoryDto,
    mockTopicDto,
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
} from "@/tests/mockdata";
import { db, type ContentDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import SingleContent from "../SingleContent.vue";
import NotFoundPage from "../../NotFoundPage.vue";
import LoadingBar from "@/components/LoadingBar.vue";
import { rememberContent, __resetRecentContent } from "@/util/recentContent";

const routeReplaceMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        //@ts-ignore
        ...actual,
        useRouter: vi.fn().mockImplementation(() => ({
            currentRoute: ref({
                name: "content",
                params: { slug: mockEnglishContentDto.slug },
            }),
            replace: routeReplaceMock,
            back: vi.fn(),
            resolve: vi.fn().mockImplementation((to: any) => {
                if (typeof to === "string") return { href: to } as any;
                const name = to?.name ?? "";
                const slug = to?.params?.slug ? `/${to.params.slug}` : "";
                return { href: `/${name}${slug}` } as any;
            }),
            getRoutes: vi.fn().mockReturnValue([]),
        })),
    };
});

// Override `queryRemote` so the cold-start backstop probe can be steered without a
// running API. Everything else from luminary-shared (db, queryLocal, …) stays real —
// a Proxy keeps the module's live bindings (e.g. `db`, which is assigned after
// `init()`) intact, where a spread copy would snapshot them as undefined.
vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    const queryRemoteMock = vi.fn(async (q: any) => {
        const conds: any[] = q?.selector?.$and ?? [];
        // The content existence probe asks for { type: Content } AND { slug }. They
        // are separate $and clauses, so match them independently.
        const wantsContent = conds.some((c) => c.type === actual.DocType.Content);
        const wantsSlug = conds.some((c) => c.slug === mockEnglishContentDto.slug);
        if (wantsContent && wantsSlug) {
            return [{ ...mockEnglishContentDto }] as ContentDto[];
        }
        return [];
    });
    return new Proxy(actual, {
        get(target, prop, receiver) {
            if (prop === "queryRemote") return queryRemoteMock;
            return Reflect.get(target, prop, receiver);
        },
    });
});

vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

// The real player has no jsdom-compatible serving strategy; this test isn't about playback.
vi.mock("@luminary-media-converter/player-web", async () => {
    const { defineComponent, h } = await import("vue");
    return {
        LuminaryPlayer: defineComponent({
            name: "LuminaryPlayer",
            props: { source: { type: Object, required: true }, preferredLanguage: {} },
            emits: ["loadedmetadata", "timeupdate", "ended"],
            setup() {
                return () => h("div", { class: "luminary-player-stub" });
            },
        }),
    };
});
// The app's player UI re-exports the mocked engine's stand-ins.
vi.mock("@/media-player/player", () => import("@luminary-media-converter/player-web"));

describe("SingleContent with a remembered article", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
        localStorage.clear();
        routeReplaceMock.mockClear();
        appLanguageIdsAsRef.value = [...appLanguageIdsAsRef.value, "lang-eng"];

        // Seed only the scaffolding docs (parents, languages) — NOT the content doc,
        // so Dexie is cold for the slug and the backstop probe is the only source.
        await db.docs.bulkPut([
            mockPostDto,
            mockCategoryDto,
            mockTopicDto,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
        ]);

        __resetRecentContent();
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
    });

    it("renders a remembered article on first render, without waiting for its IndexedDB read", async () => {
        await db.docs.put(mockEnglishContentDto);
        rememberContent([mockEnglishContentDto]);

        const wrapper = mount(SingleContent, {
            props: { slug: mockEnglishContentDto.slug },
        });

        // Synchronously after mount: no read has had a chance to land yet.
        expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        expect(wrapper.findComponent(LoadingBar).exists()).toBe(false);
        expect(wrapper.findComponent(NotFoundPage).exists()).toBe(false);
    });

    it("waits for the read when the remembered copy is not published yet", () => {
        rememberContent([
            { ...mockEnglishContentDto, publishDate: Date.now() + 86_400_000 } as ContentDto,
        ]);

        const wrapper = mount(SingleContent, {
            props: { slug: mockEnglishContentDto.slug },
        });

        expect(wrapper.text()).not.toContain(mockEnglishContentDto.title);
    });

    it("drops a remembered article that the query no longer finds", async () => {
        const gone = { ...mockEnglishContentDto, _id: "content-gone", slug: "gone-slug" };
        rememberContent([gone]);

        const wrapper = mount(SingleContent, { props: { slug: gone.slug } });
        expect(wrapper.text()).toContain(gone.title);

        await waitForExpect(() => {
            expect(wrapper.findComponent(NotFoundPage).exists()).toBe(true);
        });
    });
});
