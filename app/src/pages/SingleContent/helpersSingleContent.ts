// src/pages/SingleContent/helpersSingleContent.ts
import router from "@/router";
import {
    ApiLiveQuery,
    db,
    DocType,
    useDexieLiveQuery,
    type ApiSearchQuery,
    type ContentDto,
    type RedirectDto,
} from "luminary-shared";
import { ref, watch, type Ref } from "vue";

function getContentFromDB(defaultContent: ContentDto, slug: string) {
    return useDexieLiveQuery(() => db.docs.where("slug").equals(slug).first(), {
        initialValue: defaultContent,
    });
}

export interface ContentLoadResult {
    content: Ref<ContentDto | undefined>;
    isLoading: Ref<boolean>;
    isCheckingApi: Ref<boolean>;
}

export function useContentLoader(
    slug: string,
    defaultContent: ContentDto,
    isConnected: Ref<boolean>,
): ContentLoadResult {
    const content = ref<ContentDto | undefined>(defaultContent);
    const isLoading = ref(true);
    const isCheckingApi = ref(false);

    const idbContent = getContentFromDB(defaultContent, slug);

    let stopApi: (() => void) | undefined;
    let hasCheckedApi = false; // Track if we've already initiated API check

    const finish = (finalDoc?: ContentDto) => {
        if (stopApi) stopApi();
        content.value = finalDoc ?? undefined;
        isLoading.value = false;
        isCheckingApi.value = false;
    };

    const handleRedirect = (redirect: RedirectDto) => {
        if (redirect.toSlug) {
            if (router?.getRoutes) {
                const routes = router.getRoutes() || [];
                const target = routes.find((r) => r.name === redirect.toSlug);
                if (target) {
                    router.replace({ name: redirect.toSlug });
                } else {
                    router.replace({ name: "content", params: { slug: redirect.toSlug } });
                }
            }
        }
    };

    watch(
        [idbContent, isConnected, () => slug],
        ([dbDoc]) => {
            // Placeholder
            if (dbDoc?._id === "") return;

            // Real content or redirect from IndexedDB
            if (dbDoc && dbDoc._id !== "") {
                if (dbDoc.type === DocType.Redirect) {
                    handleRedirect(dbDoc as RedirectDto);
                    finish(undefined);
                } else {
                    // Update content from IndexedDB (stay reactive)
                    content.value = dbDoc as ContentDto;
                    isLoading.value = false;
                    isCheckingApi.value = false;
                }
                return;
            }

            // No local content
            if (!isConnected.value) {
                finish(undefined);
                return;
            }

            // Online, check API (only once)
            if (hasCheckedApi) return;
            hasCheckedApi = true;
            isCheckingApi.value = true;

            const query = ref<ApiSearchQuery>({ slug });
            const apiLive = new ApiLiveQuery(query);
            const apiRef = apiLive.toRef();

            stopApi = watch(
                apiRef,
                (apiDoc) => {
                    if (apiDoc === undefined) return;

                    // API returned null = 404
                    if (apiDoc === null) {
                        finish(undefined);
                        return;
                    }

                    if (apiDoc.type === DocType.Redirect) {
                        handleRedirect(apiDoc as RedirectDto);
                        finish(undefined);
                    } else {
                        finish(apiDoc as ContentDto);
                    }
                },
                { immediate: true },
            );
        },
        { immediate: true },
    );

    return { content, isLoading, isCheckingApi };
}
