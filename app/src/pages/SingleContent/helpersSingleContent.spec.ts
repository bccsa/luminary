import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { useContentLoader } from "./helpersSingleContent";
import { mockEnglishContentDto, mockRedirectDto, mockLanguageDtoEng } from "@/tests/mockdata";
import {
    db,
    DocType,
    PublishStatus,
    ApiLiveQuery,
    type ContentDto,
    type RedirectDto,
} from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { ref, nextTick } from "vue";

const routeReplaceMock = vi.hoisted(() => vi.fn());
vi.mock("@/router", () => ({
    default: {
        replace: routeReplaceMock,
        getRoutes: vi.fn().mockReturnValue([
            { name: "home", path: "/" },
            { name: "content", path: "/content/:slug" },
        ]),
    },
}));

describe("helpersSingleContent", () => {
    let mockApiLiveQueryToRef: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();

        appLanguageIdsAsRef.value = ["lang-eng"];

        await db.docs.bulkPut([mockEnglishContentDto, mockLanguageDtoEng, mockRedirectDto]);

        setActivePinia(createTestingPinia());
        routeReplaceMock.mockClear();

        // Mock ApiLiveQuery.prototype.toRef directly
        mockApiLiveQueryToRef = vi.fn().mockReturnValue(ref(undefined));
        vi.spyOn(ApiLiveQuery.prototype, "toRef").mockImplementation(
            () => mockApiLiveQueryToRef() as any,
        );
    });

    afterEach(async () => {
        await db.docs.clear();
        vi.restoreAllMocks();
    });

    describe("useContentLoader", () => {
        it("loads content from IndexedDB when offline", async () => {
            const isConnected = ref(false);
            const defaultContent = {
                _id: "",
                type: DocType.Content,
                updatedTimeUtc: 0,
                memberOf: [],
                parentId: "",
                language: "lang-eng",
                status: PublishStatus.Published,
                title: "Loading...",
                slug: "",
                publishDate: 0,
                parentTags: [],
            };

            const { content, isLoading, isCheckingApi } = useContentLoader(
                mockEnglishContentDto.slug,
                defaultContent,
                isConnected,
            );

            // Initially should be loading
            expect(isLoading.value).toBe(true);
            expect(isCheckingApi.value).toBe(false);

            await waitForExpect(() => {
                expect(content.value?._id).toBe(mockEnglishContentDto._id);
                expect(content.value?.title).toBe(mockEnglishContentDto.title);
                expect(isLoading.value).toBe(false);
                expect(isCheckingApi.value).toBe(false);
            });
        });

        it("returns undefined and stops loading when content not found offline", async () => {
            const isConnected = ref(false);
            const defaultContent = {
                _id: "",
                type: DocType.Content,
                updatedTimeUtc: 0,
                memberOf: [],
                parentId: "",
                language: "lang-eng",
                status: PublishStatus.Published,
                title: "Loading...",
                slug: "",
                publishDate: 0,
                parentTags: [],
            };

            const { content, isLoading, isCheckingApi } = useContentLoader(
                "non-existent-slug",
                defaultContent,
                isConnected,
            );

            await waitForExpect(() => {
                expect(content.value).toBeUndefined();
                expect(isLoading.value).toBe(false);
                expect(isCheckingApi.value).toBe(false);
            });
        });

        it("checks API when online and content not in IndexedDB", async () => {
            // Remove content from IndexedDB
            await db.docs.delete(mockEnglishContentDto._id);

            const isConnected = ref(true);
            const defaultContent = {
                _id: "",
                type: DocType.Content,
                updatedTimeUtc: 0,
                memberOf: [],
                parentId: "",
                language: "lang-eng",
                status: PublishStatus.Published,
                title: "Loading...",
                slug: "",
                publishDate: 0,
                parentTags: [],
            };

            const apiRef = ref<ContentDto | undefined>(undefined);
            mockApiLiveQueryToRef.mockReturnValue(apiRef);

            const { content, isLoading, isCheckingApi } = useContentLoader(
                mockEnglishContentDto.slug,
                defaultContent,
                isConnected,
            );

            // Should start checking API
            await waitForExpect(() => {
                expect(isCheckingApi.value).toBe(true);
            });

            apiRef.value = mockEnglishContentDto;

            await waitForExpect(() => {
                expect(content.value?._id).toBe(mockEnglishContentDto._id);
                expect(isLoading.value).toBe(false);
                expect(isCheckingApi.value).toBe(false);
            });
        });

        it("sets content to undefined when API returns 404", async () => {
            await db.docs.delete(mockEnglishContentDto._id);

            const isConnected = ref(true);
            const defaultContent = {
                _id: "",
                type: DocType.Content,
                updatedTimeUtc: 0,
                memberOf: [],
                parentId: "",
                language: "lang-eng",
                status: PublishStatus.Published,
                title: "Loading...",
                slug: "",
                publishDate: 0,
                parentTags: [],
            };

            const apiRef = ref(undefined);
            mockApiLiveQueryToRef.mockReturnValue(apiRef);

            const { content, isLoading, isCheckingApi } = useContentLoader(
                "non-existent-slug",
                defaultContent,
                isConnected,
            );

            await waitForExpect(() => {
                expect(isCheckingApi.value).toBe(true);
            });

            // API returns null for 404
            (apiRef.value as any) = null;

            await waitForExpect(() => {
                expect(content.value).toBeUndefined();
                expect(isLoading.value).toBe(false);
                expect(isCheckingApi.value).toBe(false);
            });
        });

        it("handles redirect from IndexedDB", async () => {
            const isConnected = ref(false);
            const defaultContent = {
                _id: "",
                type: DocType.Content,
                updatedTimeUtc: 0,
                memberOf: [],
                parentId: "",
                language: "lang-eng",
                status: PublishStatus.Published,
                title: "Loading...",
                slug: "",
                publishDate: 0,
                parentTags: [],
            };

            const { content, isLoading } = useContentLoader(
                mockRedirectDto.slug,
                defaultContent,
                isConnected,
            );

            await waitForExpect(() => {
                expect(routeReplaceMock).toHaveBeenCalledWith({
                    name: "content",
                    params: { slug: mockRedirectDto.toSlug },
                });
                expect(content.value).toBeUndefined();
                expect(isLoading.value).toBe(false);
            });
        });

        it("handles redirect from API", async () => {
            await db.docs.delete(mockRedirectDto._id);

            const isConnected = ref(true);
            const defaultContent = {
                _id: "",
                type: DocType.Content,
                updatedTimeUtc: 0,
                memberOf: [],
                parentId: "",
                language: "lang-eng",
                status: PublishStatus.Published,
                title: "Loading...",
                slug: "",
                publishDate: 0,
                parentTags: [],
            };

            const apiRef = ref<RedirectDto | undefined>(undefined);
            mockApiLiveQueryToRef.mockReturnValue(apiRef);

            const { content, isLoading, isCheckingApi } = useContentLoader(
                mockRedirectDto.slug,
                defaultContent,
                isConnected,
            );

            await waitForExpect(() => {
                expect(isCheckingApi.value).toBe(true);
            });

            apiRef.value = mockRedirectDto;

            await waitForExpect(() => {
                expect(routeReplaceMock).toHaveBeenCalledWith({
                    name: "content",
                    params: { slug: mockRedirectDto.toSlug },
                });
                expect(content.value).toBeUndefined();
                expect(isLoading.value).toBe(false);
                expect(isCheckingApi.value).toBe(false);
            });
        });

        it("handles redirect to route name from IndexedDB", async () => {
            const redirectToHome = {
                ...mockRedirectDto,
                _id: "redirect-home",
                slug: "go-home",
                toSlug: "home",
            };
            await db.docs.put(redirectToHome);

            const isConnected = ref(false);
            const defaultContent = {
                _id: "",
                type: DocType.Content,
                updatedTimeUtc: 0,
                memberOf: [],
                parentId: "",
                language: "lang-eng",
                status: PublishStatus.Published,
                title: "Loading...",
                slug: "",
                publishDate: 0,
                parentTags: [],
            };

            const { content } = useContentLoader(redirectToHome.slug, defaultContent, isConnected);

            await waitForExpect(() => {
                expect(routeReplaceMock).toHaveBeenCalledWith({
                    name: "content",
                    params: {
                        slug: "home",
                    },
                });
                expect(content.value).toBeUndefined();
            });
        });

        it("prefers IndexedDB content over API when online", async () => {
            const isConnected = ref(true);
            const defaultContent = {
                _id: "",
                type: DocType.Content,
                updatedTimeUtc: 0,
                memberOf: [],
                parentId: "",
                language: "lang-eng",
                status: PublishStatus.Published,
                title: "Loading...",
                slug: "",
                publishDate: 0,
                parentTags: [],
            };

            const { content, isLoading, isCheckingApi } = useContentLoader(
                mockEnglishContentDto.slug,
                defaultContent,
                isConnected,
            );

            await waitForExpect(() => {
                // Should load from IndexedDB without checking API
                expect(content.value?._id).toBe(mockEnglishContentDto._id);
                expect(isLoading.value).toBe(false);
                expect(isCheckingApi.value).toBe(false);
                expect(mockApiLiveQueryToRef).not.toHaveBeenCalled();
            });
        });

        it("does not flash 404 while loading from IndexedDB", async () => {
            const isConnected = ref(false);
            const defaultContent = {
                _id: "",
                type: DocType.Content,
                updatedTimeUtc: 0,
                memberOf: [],
                parentId: "",
                language: "lang-eng",
                status: PublishStatus.Published,
                title: "Loading...",
                slug: "",
                publishDate: 0,
                parentTags: [],
            };

            const { content, isLoading } = useContentLoader(
                mockEnglishContentDto.slug,
                defaultContent,
                isConnected,
            );

            // While loading, content should be the placeholder
            expect(content.value?._id).toBe("");
            expect(isLoading.value).toBe(true);

            await nextTick();

            // Still loading
            expect(isLoading.value).toBe(true);

            await waitForExpect(() => {
                // Finally loaded
                expect(content.value?._id).toBe(mockEnglishContentDto._id);
                expect(isLoading.value).toBe(false);
            });
        });

        it("does not flash 404 while checking API", async () => {
            await db.docs.delete(mockEnglishContentDto._id);

            const isConnected = ref(true);
            const defaultContent = {
                _id: "",
                type: DocType.Content,
                updatedTimeUtc: 0,
                memberOf: [],
                parentId: "",
                language: "lang-eng",
                status: PublishStatus.Published,
                title: "Loading...",
                slug: "",
                publishDate: 0,
                parentTags: [],
            };

            const apiRef = ref<ContentDto | undefined>(undefined);
            mockApiLiveQueryToRef.mockReturnValue(apiRef);

            const { isLoading, isCheckingApi } = useContentLoader(
                mockEnglishContentDto.slug,
                defaultContent,
                isConnected,
            );

            // Should be checking API
            await waitForExpect(() => {
                expect(isCheckingApi.value).toBe(true);
                expect(isLoading.value).toBe(true);
            });

            apiRef.value = mockEnglishContentDto;

            // Wait for API response
            await waitForExpect(() => {
                expect(isLoading.value).toBe(false);
                expect(isCheckingApi.value).toBe(false);
            });
        });
    });
});
