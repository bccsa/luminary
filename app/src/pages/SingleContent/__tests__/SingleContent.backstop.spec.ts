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

describe("SingleContent cold-start backstop", () => {
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

    it("does not flash 404 on a cold start when the content exists remotely", async () => {
        const wrapper = mount(SingleContent, {
            props: { slug: mockEnglishContentDto.slug },
        });

        // The backstop probe resolves the doc via queryRemote; the article should
        // appear without NotFoundPage ever rendering (the 404 flash this guards
        // against used to show before sync populated Dexie).
        let notFoundAppeared = false;
        const unwatch = wrapper.vm.$watch(
            () => wrapper.findComponent(NotFoundPage).exists(),
            (exists) => {
                if (exists) notFoundAppeared = true;
            },
            { flush: "sync" },
        );

        try {
            await waitForExpect(() => {
                expect(wrapper.text()).toContain(mockEnglishContentDto.title);
                expect(wrapper.findComponent(NotFoundPage).exists()).toBe(false);
            });
        } finally {
            unwatch();
        }

        expect(notFoundAppeared).toBe(false);
    });

    it("still resolves to a real 404 on a cold start when the remote confirms absence", async () => {
        // No doc for this slug locally or remotely → backstop finds nothing → 404.
        const wrapper = mount(SingleContent, {
            props: { slug: "truly-missing-slug" },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(NotFoundPage).exists()).toBe(true);
            expect(wrapper.find("article").exists()).toBe(false);
        });
    });
});