import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import SingleContent from "../SingleContent.vue";
import {
    mockPostDto,
    mockEnglishContentDto,
    mockCategoryContentDto,
    mockLanguageDtoFra,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockCategoryDto,
    mockTopicContentDto,
    mockTopicDto,
    mockRedirectDto,
} from "@/tests/mockdata";
import { db } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { ref } from "vue";
import * as auth from "@/auth";

// Spy on the retention touch so we can assert SingleContent refreshes a viewed
// article's retention deadline. The global vitest.setup mocks "luminary-shared"
// (Proxy over the real module, overriding only mangoToDexie); a per-file vi.mock
// of the same module replaces that, so we replicate the mangoToDexie behaviour
// here verbatim and additionally swap in a touchRetention spy.
const touchRetentionMock = vi.hoisted(() => vi.fn());

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
            if (prop === "touchRetention") return touchRetentionMock;
            return Reflect.get(target, prop);
        },
    });
});

const routeReplaceMock = vi.hoisted(() => vi.fn());
const mockIsExternalNavigation = vi.hoisted(() => vi.fn());

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

vi.mock("@/router", () => ({
    isExternalNavigation: () => mockIsExternalNavigation(),
    markInternalNavigation: vi.fn(),
}));

vi.mock("@/auth", async () => {
    const { ref } = await import("vue");
    return {
        activeProviderId: ref(null),
        clearAuth0Cache: vi.fn(),
        isAuthPluginInstalled: ref(true),
        openProviderModal: vi.fn(),
        useAuth: vi.fn(() => ({
            isLoading: ref(false),
            isAuthenticated: ref(false),
            user: ref(null),
            loginWithRedirect: vi.fn(),
            logout: vi.fn(),
        })),
    };
});

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("SingleContent retention touch", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();

        routeReplaceMock.mockClear();
        mockIsExternalNavigation.mockReturnValue(false);

        appLanguageIdsAsRef.value = [...appLanguageIdsAsRef.value, "lang-eng"];

        await db.docs.bulkPut([
            mockPostDto,
            mockCategoryDto,
            mockTopicDto,
            mockTopicContentDto,
            mockCategoryContentDto,
            mockEnglishContentDto,
            mockFrenchContentDto,
            mockLanguageDtoEng,
            mockLanguageDtoFra,
            mockRedirectDto,
        ]);

        setActivePinia(createTestingPinia());

        vi.clearAllMocks();

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

    it("touches retention with the content _id when a real content doc is displayed", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        // Wait until the real content doc is rendered (not the "Loading..." placeholder).
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });

        await waitForExpect(() => {
            expect(touchRetentionMock).toHaveBeenCalledWith([mockEnglishContentDto._id]);
        });

        // Every call must carry a real, non-empty _id — never the placeholder's "".
        for (const call of touchRetentionMock.mock.calls) {
            expect(call[0]).toEqual([mockEnglishContentDto._id]);
        }
    });

    it("does not touch retention for the default placeholder (empty _id)", async () => {
        // No matching slug means idbContent stays undefined and content never
        // becomes a real doc; the only thing it is ever set to is the placeholder
        // (whose _id is ""), so touchRetention must never be called.
        mount(SingleContent, {
            props: {
                slug: "no-such-slug",
            },
        });

        // Give the live query + watchers time to settle.
        await waitForExpect(() => {
            // Sanity: the placeholder _id is the empty string.
            expect(touchRetentionMock).not.toHaveBeenCalledWith([""]);
        });

        // It must never have been called at all in the placeholder-only path.
        expect(touchRetentionMock).not.toHaveBeenCalled();
    });

    it("does not touch retention when content is undefined (offline, not found)", async () => {
        // Force the offline / not-found branch: isConnected is false by default in
        // the test harness, and with a non-matching slug idbContent is undefined,
        // so the watcher sets content.value = undefined → no retention touch.
        mount(SingleContent, {
            props: {
                slug: "definitely-missing-slug",
            },
        });

        await waitForExpect(() => {
            expect(touchRetentionMock).not.toHaveBeenCalledWith([""]);
        });

        expect(touchRetentionMock).not.toHaveBeenCalled();
    });
});
