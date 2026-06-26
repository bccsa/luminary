<script setup lang="ts">
import {
    DocType,
    PostType,
    PublishStatus,
    TagType,
    db,
    isConnected,
    queryLocal,
    queryRemote,
    useHybridQuery,
    touchRetention,
    type ContentDto,
    type RedirectDto,
    type Uuid,
    type LanguageDto,
    verifyAccess,
    AclPermission,
} from "luminary-shared";
import { useContentQuery } from "@/composables/useContentQuery";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { BookmarkIcon as BookmarkIconSolid, TagIcon, SunIcon } from "@heroicons/vue/24/solid";
import {
    BookmarkIcon as BookmarkIconOutline,
    MoonIcon,
    ClockIcon,
    PencilIcon,
} from "@heroicons/vue/24/outline";

import { DateTime } from "luxon";
import { useRouter } from "vue-router";
import {
    appName,
    appLanguagePreferredIdAsRef,
    isDarkTheme,
    theme,
    appLanguageAsRef,
    queryParams,
    addToMediaQueue,
    cmsUrl,
} from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import RelatedContent from "@/components/content/RelatedContent.vue";
import VerticalTagViewer from "@/components/tags/VerticalTagViewer.vue";

import LImage from "@/components/images/LImage.vue";

import { userPreferencesAsRef } from "@/globalConfig";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import LModal from "@/components/form/LModal.vue";
import CopyrightBanner from "@/components/content/CopyrightBanner.vue";
import FallbackLanguageBadge from "@/components/content/FallbackLanguageBadge.vue";
import { useI18n } from "vue-i18n";
import ImageModal from "@/components/images/ImageModal.vue";
import BasePage from "@/components/BasePage.vue";
import { CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/vue/20/solid";
import { SpeakerWaveIcon } from "@heroicons/vue/24/solid";
import { markLanguageSwitch } from "@/util/isLangSwitch";
import LoadingBar from "@/components/LoadingBar.vue";
import { activeImageCollection } from "@/components/images/LImageProvider.vue";
import { isExternalNavigation } from "@/router";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import LHighlightable from "@/components/common/LHighlightable.vue";
import DropdownMenu from "@/components/common/DropdownMenu.vue";
import { markPageReady } from "@/util/renderState";

const router = useRouter();

type Props = {
    slug: string;
};
const props = defineProps<Props>();

const { t } = useI18n();
const showCategoryModal = ref(false);
const enableZoom = ref(false);
const selectedLanguageId = ref(appLanguagePreferredIdAsRef.value);
const availableTranslations = ref<ContentDto[]>([]);
const languages = ref<LanguageDto[]>([]);

const currentImageIndex = ref(0);

const defaultContent: ContentDto = {
    _id: "",
    type: DocType.Content,
    updatedTimeUtc: 0,
    memberOf: [],
    parentId: "",
    language: appLanguagePreferredIdAsRef.value || "",
    status: PublishStatus.Published,
    title: "Loading...",
    slug: "",
    publishDate: 0,
    parentTags: [],
};

const content = ref<ContentDto | undefined>(defaultContent);

const liveUrl = () => {
    if (!content.value || !selectedLanguageCode.value) return "";

    const docType = content.value.parentType;
    const subType = content.value.parentPostType || content.value.parentTagType;
    const id = content.value.parentId;
    const lang = selectedLanguageCode.value;
    const baseUrl = cmsUrl.value;
    const url = baseUrl
        ? `${baseUrl}/${docType}/edit/${subType}/${id}/${lang}`
        : "http://localhost";

    return url.toString();
};

const openCmsEditor = () => {
    if (liveUrl()) {
        window.open(liveUrl(), "_blank");
    }
};

const canEdit = () => {
    if (!content.value) return false;
    if (content.value.memberOf.length === 0) return true;
    return verifyAccess(content.value.memberOf, content.value.parentType!, AclPermission.Edit);
};

// Content by slug. HybridQuery does the local-first Dexie read + the below-cutoff
// API supplement (incl. deferring the POST until online). The query filters publish
// state itself (status / publishDate / expiry), so a draft / scheduled / expired slug
// resolves to nothing → the not-found path. languageFilter is off so a direct link to
// any translation isn't excluded by the user's language preference. cache:false avoids
// a first-paint flash of a previously-viewed article (single-doc structural key).
const contentArr = useContentQuery(() => [{ slug: props.slug }], {
    includeScheduled: false,
    languageFilter: false,
    cache: false,
    // Seek the single slug doc via the slug-led index instead of scanning the whole
    // content collection on the publishDate index. The publishDate sort is required
    // for CouchDB to engage the index (slug eq alone falls back to a full scan).
    useIndex: "content-slug-publishDate-index",
    sort: [{ publishDate: "desc" }],
    // Keep `text` (the article body, rendered below) and `memberOf` (read by
    // canEdit) — the default strip set would drop both.
    stripFields: ["fts", "ftsTokenCount", "_rev"],
});

// Redirect resolution. A redirect takes precedence over content — but that precedence
// is enforced on the server (publishing content onto a redirect's slug is forced to
// draft), not here. The slug invariant therefore guarantees a slug carries *either*
// published content or a redirect, never both, so the eager local check and the content
// bind below never contend: at most one of them resolves. Synced redirects route
// instantly via queryLocal on slug change; a redirect that exists only on the server is
// caught by queryRemote in the not-found resolver, so normal pages pay no redirect API call.
function routeRedirect(redirect: RedirectDto): boolean {
    if (!redirect?.toSlug) return false;
    const targetRoute = router.getRoutes().find((r) => r.name === redirect.toSlug);
    if (targetRoute) router.replace({ name: redirect.toSlug });
    else router.replace({ name: "content", params: { slug: redirect.toSlug } });
    return true;
}

// Loading until the content query produces an answer for the current slug.
const isLoading = ref(true);
const is404 = ref(false);

let notFoundTimer: ReturnType<typeof setTimeout> | undefined;
const clearNotFoundTimer = () => {
    if (notFoundTimer) clearTimeout(notFoundTimer);
    notFoundTimer = undefined;
};

// When nothing matches the slug, HybridQuery's (change-gated) output stays empty and
// never emits — so after the local read + (online) API supplement have had time to
// land, treat an empty result as "not found". Last chance before 404: a redirect that
// exists only on the server (only reached when the slug resolves to no content).
const scheduleNotFound = () => {
    clearNotFoundTimer();
    notFoundTimer = setTimeout(
        async () => {
            if (contentArr.value.length) return;
            const slug = props.slug;
            if (isConnected.value) {
                try {
                    const remote = await queryRemote<RedirectDto>({
                        selector: { $and: [{ type: DocType.Redirect }, { slug }] },
                    });
                    if (props.slug !== slug) return; // slug changed mid-await
                    if (remote[0] && routeRedirect(remote[0])) return;
                } catch {
                    /* fall through to 404 */
                }
            }
            if (!contentArr.value.length) {
                content.value = undefined;
                isLoading.value = false;
            }
        },
        isConnected.value ? 5000 : 1500,
    );
};

watch(
    () => props.slug,
    async (slug) => {
        isLoading.value = true;
        scheduleNotFound();
        // Instant local redirect check (synced redirects route immediately).
        const redirect = (
            await queryLocal<RedirectDto>({
                selector: { $and: [{ type: DocType.Redirect }, { slug }] },
            })
        )[0];
        if (props.slug === slug && redirect) routeRedirect(redirect);
    },
    { immediate: true },
);

// Bind the resolved content. A found doc wins immediately and clears loading.
watch(
    contentArr,
    (docs) => {
        if (docs.length) {
            content.value = docs[0];
            isLoading.value = false;
            clearNotFoundTimer();
        }
    },
    { immediate: true },
);

// Drop a pending not-found timer on unmount so its remote redirect probe can't fire
// after the user has navigated away (e.g. via a route-name redirect match).
onUnmounted(clearNotFoundTimer);

// Keep a viewed article alive in the offline document store: refresh its retention
// deadline whenever a real content doc is displayed, so a below-cutoff article the
// user reads isn't evicted as stale. No-op for the placeholder / undefined.
watch(content, (c) => {
    if (c && c._id) touchRetention([c._id]);
});

// Available translations + their languages. HybridQuery merges the local read with
// the below-cutoff API supplement; the language list is a fully-synced type read
// straight from IndexedDB.
const isLoadingTranslations = ref(false);

// Per-document lookup → response cache stays off (the useContentQuery default). The
// cache key is the query shape (parentId is stripped to a placeholder), so a seed here
// would be a previously-viewed post's translations — which feed availableTranslations
// and drive the auto-navigation below, redirecting this page back to that post.
const translationsArr = useContentQuery(
    // Before `content` resolves there is no parent to match siblings against. An
    // empty `$in` is provably-empty, so HybridQuery short-circuits both the Dexie
    // read and the API supplement — a `parentId: ""` placeholder instead POSTs a
    // match-nothing query that full-scans the publishDate index.
    () =>
        content.value?.parentId
            ? [{ parentId: content.value.parentId }]
            : [{ parentId: { $in: [] } }],
    {
        publishedFilter: false,
        // Seek siblings by parentId rather than scanning the publishDate index. The
        // provably-empty `$in: []` branch short-circuits before any API call, so the
        // index/sort only matter on the resolved-parentId (equality) branch.
        useIndex: "content-parentId-publishDate-index",
        sort: [{ publishDate: "desc" }],
        // A language switch binds the chosen translation straight into `content`, so
        // these docs must retain the same fields as the main content query: `text`
        // (the article body) and `memberOf` (read by canEdit). The default strip set
        // would drop both, blanking the body and crashing the edit check.
        stripFields: ["fts", "ftsTokenCount", "_rev"],
    },
);
const allLanguages = useHybridQuery<LanguageDto>(() => ({ selector: { type: DocType.Language } }), {
    live: true,
    // Only the i18n singleton in globalConfig needs `translations`; this query reads
    // just id/name/languageCode/averageReadingSpeed, so drop the heavy strings map.
    stripFields: ["translations", "_rev"],
});

watch(
    [translationsArr, allLanguages, () => content.value?.parentId],
    () => {
        if (!content.value) return;
        const published = (translationsArr.value as ContentDto[]).filter(
            (c) => c.status === PublishStatus.Published,
        );
        if (published.length > 1) {
            availableTranslations.value = published;
            languages.value = allLanguages.value.filter((lang) =>
                published.some((t) => t.language === lang._id),
            );
        }
    },
    { immediate: true },
);

const tags = useContentQuery(
    () => {
        // Before `content` resolves, match nothing via a provably-empty `$in`
        // rather than POSTing `{ parentId: { $in: [""] } }`, which full-scans.
        if (!content.value?.parentId) return [{ parentId: { $in: [] } }];
        // Include this document's parent ID to show content tagged with this
        // document's parent (if a TagDto).
        const parentIds = (content.value.parentTags || []).concat([content.value.parentId]);
        return [{ parentId: { $in: parentIds } }, { parentType: DocType.Tag }];
    },
    // Per-document lookup → response cache stays off (the useContentQuery default): a
    // shape-keyed seed would carry a previously-viewed post's tags, wrongly setting
    // selectedCategoryId and RelatedContent.
    { includeScheduled: false },
);

const categoryTags = computed(() => tags.value.filter((t) => t.parentTagType == TagType.Category));
const selectedCategoryId = ref<Uuid | undefined>();

// isLoading / is404 are declared alongside the content sources above.

// The content query already filters publish state, so `content` is either a valid
// published doc or absent — 404 is purely "resolved to nothing".
const check404 = () => {
    if (isLoading.value) return false; // Don't show 404 during loading
    if (content.value === defaultContent) return false; // still the loading placeholder
    return !content.value;
};

watch(content, () => {
    is404.value = check404();
});

// Function to toggle bookmark for the current content
const toggleBookmark = () => {
    if (!userPreferencesAsRef.value.bookmarks) {
        userPreferencesAsRef.value.bookmarks = [];
    }

    if (isBookmarked.value) {
        // Remove from bookmarks
        userPreferencesAsRef.value.bookmarks = userPreferencesAsRef.value.bookmarks.filter(
            (b) => b.id != content.value?.parentId,
        );
    } else {
        // Add to bookmarks
        if (!content.value) return;
        userPreferencesAsRef.value.bookmarks.push({ id: content.value.parentId, ts: Date.now() });
        useNotificationStore().addNotification({
            id: "bookmark-added",
            title: t("bookmarks.notification.title"),
            description: t("bookmarks.notification.description"),
            state: "success",
            type: "toast",
            timeout: 5000,
        });
    }
};

// Check if the current content is bookmarked
const isBookmarked = computed(() => {
    return userPreferencesAsRef.value.bookmarks?.some((b) => b.id == content.value?.parentId);
});

watch([content, is404], () => {
    if (content.value) isLoading.value = false;

    // Set document title and meta tags
    document.title = is404.value
        ? `Page not found - ${appName}`
        : `${content.value?.seoTitle || content.value?.title} - ${appName}`;

    if (is404.value) return;

    // SEO meta tag settings
    let metaTag = document.querySelector("meta[name='description']");
    if (!metaTag) {
        // If the meta tag doesn't exist, create it
        metaTag = document.createElement("meta");
        metaTag.setAttribute("name", "description");
        document.head.appendChild(metaTag);
    }
    // Update the content attribute
    metaTag.setAttribute("content", content.value?.seoString || content.value?.summary || "");
});

const text = computed(() => content.value?.text ?? "");

// Select the first category in the content by category list on load
watch(tags, () => {
    if (selectedCategoryId.value) return;
    const categories = tags.value.filter((t) => t.parentTagType == TagType.Category);
    if (categories.length) selectedCategoryId.value = categories[0].parentId;
});

const selectedCategory = computed(() => {
    if (!selectedCategoryId.value) return undefined;
    return tags.value.find((t) => t.parentId == selectedCategoryId.value);
});

// Force language from query param
const langToForce = queryParams.get("langId");

watch(
    [availableTranslations, languages],
    () => {
        if (!langToForce || !availableTranslations.value.length || !languages.value.length) return;
        const lang = languages.value.find((l) => l.languageCode === langToForce);
        if (!lang) return;
        const translation = availableTranslations.value.find((c) => c.language === lang._id);
        if (!translation) return;
        selectedLanguageId.value = lang._id;
        content.value = translation;
    },
    { immediate: true },
);

const hasAutoNavigated = ref(false);
const previousPreferredId = ref(appLanguagePreferredIdAsRef.value);

/**
 * Watches for changes in the `content` reactive property.
 * When `content` is updated, it sets the `selectedLanguageId`
 * to the `language` property of the new `content` value, if available.
 */
watch(
    () => [content.value, appLanguagePreferredIdAsRef.value],
    ([newContent, preferredId]) => {
        if (!newContent) return;
        const currentContent = newContent as ContentDto;

        // Check if user actively changed their preferred language (via LanguageModal)
        const preferredLanguageChanged = previousPreferredId.value !== preferredId;
        previousPreferredId.value = preferredId as string;

        // If user changed preferred language and a translation exists, switch to it smoothly
        if (preferredLanguageChanged && hasAutoNavigated.value) {
            // On page load: if preferred language exists and has translation → switch to it
            const preferredTranslation = availableTranslations.value.find(
                (t) => t.language === preferredId,
            );
            if (preferredTranslation && preferredTranslation.slug !== currentContent.slug) {
                content.value = preferredTranslation;
                const newUrl = router.resolve({
                    name: "content",
                    params: { slug: preferredTranslation.slug },
                }).href;
                window.history.replaceState(window.history.state, "", newUrl);
                selectedLanguageId.value = preferredTranslation.language;
                return;
            }
        }

        // Only auto-navigate once on initial load, not when user changes preferences via LanguageModal
        if (!hasAutoNavigated.value) {
            hasAutoNavigated.value = true;
            const preferredTranslation = availableTranslations.value.find(
                (t) => t.language === preferredId,
            );
            // Navigate to preferred version
            if (preferredTranslation && preferredTranslation.slug !== currentContent.slug) {
                router.replace({ name: "content", params: { slug: preferredTranslation.slug } });
                return;
            }
        }

        // Otherwise, sync dropdown to current content's language
        selectedLanguageId.value = currentContent.language;
    },
    { immediate: true },
);

const openedFromExternalLink = ref(false);

onMounted(() => {
    openedFromExternalLink.value = isExternalNavigation();
});

// Track whether the user explicitly switched language via the quick selector
const userSwitchedLanguage = ref(false);

// Quick language switch (dropdown)
watch(selectedLanguageId, (newId) => {
    if (!newId || !content.value) return;

    const target = availableTranslations.value.find((c) => c.language === newId);
    if (!target || target.slug === content.value.slug) return;

    userSwitchedLanguage.value = true;
    content.value = target;
    const newUrl = router.resolve({ name: "content", params: { slug: target.slug } }).href;
    window.history.replaceState(window.history.state, "", newUrl);
});

// Show banner: only external navigation + preferred lang exists + different slug
// Do not show banner if the user explicitly switched language via the quick selector
watch(
    () => [
        content.value,
        appLanguagePreferredIdAsRef.value,
        openedFromExternalLink.value,
        availableTranslations.value,
    ],
    ([cur, prefId, external, translations]) => {
        if (!cur || !prefId || !external) return;
        if (userSwitchedLanguage.value) return;
        const currentContent = cur as ContentDto;
        if (currentContent.language === prefId) return;

        const preferred = (translations as ContentDto[]).find(
            (t) => t.language === prefId && t.slug !== currentContent.slug,
        );

        if (!preferred) return;

        setTimeout(() => {
            useNotificationStore().addNotification({
                id: "content-available",
                title: () => t("notification.translation_available.title"),
                description: () =>
                    t("notification.translation_available.description", {
                        language: appLanguageAsRef.value?.name,
                    }),
                state: "info",
                type: "banner",
                closable: true,
                link: { name: "content", params: { slug: preferred.slug } },
                openLink: true,
            });
        }, 800);
    },
    { immediate: true },
);

// Remove banner when user is on preferred language
watch(
    () => content.value?.language,
    (lang) => {
        if (lang === appLanguagePreferredIdAsRef.value) {
            useNotificationStore().removeNotification("content-available");
        }
    },
    { immediate: true },
);

const showDropdown = ref(false);

const selectedLanguageCode = computed(() => {
    if (!selectedLanguageId.value || !languages.value.length) return null;
    const selectedLang = languages.value.find((lang) => lang._id === selectedLanguageId.value);
    return selectedLang?.languageCode || null;
});

watch(
    content,
    (newContent) => {
        if (!newContent) return;
        if (selectedLanguageId.value !== newContent.language) {
            selectedLanguageId.value = newContent.language;
        }
    },
    { immediate: true },
);

const quickLanguageSwitch = (languageId: string) => {
    markLanguageSwitch();
    selectedLanguageId.value = languageId;
    showDropdown.value = false;
};

// Check if the current content has audio files - fully reactive to data changes
const hasAudioFiles = computed(() => {
    // Check the live query result first (most up-to-date), then fall back to content ref
    const dataSource = contentArr.value[0] || content.value;
    const fileCollections = dataSource?.parentMedia?.fileCollections;
    return !!(fileCollections && Array.isArray(fileCollections) && fileCollections.length > 0);
});

// Function to start playing audio
const playAudio = () => {
    if (content.value && hasAudioFiles.value) {
        addToMediaQueue(content.value);
    }
};

const readingTime = computed<number>(() => {
    if (!content.value) return 0;
    const wordCount = content.value.wordCount!;
    const currentLanguage = languages.value.find((l) => l._id === content.value?.language);
    const readingSpeed = currentLanguage?.averageReadingSpeed || 200;

    return Math.ceil(wordCount / readingSpeed);
});

watch([isLoading, content, is404], async () => {
    if (is404.value) {
        await nextTick();
        markPageReady();
        return;
    }
    if (!isLoading.value && content.value && content.value !== defaultContent) {
        await nextTick();
        markPageReady();
    }
});
</script>

<template>
    <BasePage
        :showBackButton="true"
        desktopTopBar
    >
        <template
            #quickControls
            v-if="!is404"
        >
            <DropdownMenu
                v-if="!isLoading && !isLoadingTranslations && availableTranslations.length > 1"
                v-model:open="showDropdown"
                panel-class="py-1"
            >
                <template #trigger>
                    <button
                        type="button"
                        name="translationSelector"
                        class="block cursor-pointer truncate rounded-md px-1.5 py-1 text-sm text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                        data-test="translationSelector"
                    >
                        <span class="hidden sm:inline">
                            {{
                                languages.find(
                                    (lang: LanguageDto) => lang._id === selectedLanguageId,
                                )?.name
                            }}
                        </span>
                        <span class="inline sm:hidden">
                            {{
                                languages
                                    .find((lang: LanguageDto) => lang._id === selectedLanguageId)
                                    ?.languageCode.toUpperCase()
                            }}
                        </span>
                    </button>
                </template>
                <button
                    v-for="language in languages"
                    :key="language._id"
                    type="button"
                    role="menuitem"
                    @click="quickLanguageSwitch(language._id)"
                    class="flex w-full cursor-pointer select-none items-center gap-2 px-4 py-2 text-left text-sm leading-6 text-zinc-800 hover:bg-zinc-50 dark:text-white dark:hover:bg-slate-600"
                    data-test="translationOption"
                >
                    {{ language.name }}
                    <CheckCircleIcon
                        v-if="selectedLanguageId === language._id"
                        class="h-5 w-5 flex-shrink-0 text-yellow-500"
                        aria-hidden="true"
                    />
                </button>
            </DropdownMenu>
            <button
                type="button"
                class="cursor-pointer rounded-md p-1 text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                data-test="themeButton"
                :aria-label="isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'"
                @click="theme = isDarkTheme ? 'light' : 'dark'"
            >
                <SunIcon
                    v-if="isDarkTheme"
                    class="h-5 w-5"
                    aria-hidden="true"
                />
                <MoonIcon
                    v-else
                    class="h-5 w-5"
                    aria-hidden="true"
                />
            </button>
        </template>

        <NotFoundPage v-if="is404" />

        <div
            v-else
            class="flex min-h-full flex-col gap-6"
            :class="{ 'mb-6': !tags.length }"
        >
            <div
                class="flex flex-grow justify-center"
                :class="{ 'items-center': isLoading }"
            >
                <LoadingBar
                    v-if="isLoading"
                    label="Loading..."
                />
                <article
                    class="w-full lg:w-3/4 lg:max-w-3xl"
                    v-else-if="!isLoading && content"
                >
                    <!-- Desktop: title row originates at the top of the page, level with the pinned
                         topbar chrome, and scrolls away with the content like normal. -->
                    <div class="hidden h-9 items-center justify-center gap-2 lg:flex">
                        <h1
                            class="truncate text-xl tracking-tight text-zinc-900 dark:text-slate-50 lg:text-2xl"
                        >
                            {{ content.title }}
                        </h1>
                        <button
                            v-if="canEdit() && cmsUrl"
                            @click="openCmsEditor"
                            class="flex flex-shrink-0 cursor-pointer items-center text-zinc-400 hover:text-yellow-500 dark:hover:text-yellow-400"
                            data-test="editButton"
                        >
                            <PencilIcon class="h-5 w-5" />
                        </button>
                    </div>

                    <div class="flex w-full flex-col items-center lg:hidden">
                        <div class="mt-1 flex flex-col gap-4 text-center md:mt-4">
                            <div class="flex flex-row items-start justify-center gap-2">
                                <h1
                                    class="text-xl tracking-tight text-zinc-900 dark:text-slate-50 lg:text-2xl"
                                >
                                    {{ content.title }}
                                </h1>
                                <button
                                    v-if="canEdit() && cmsUrl"
                                    @click="openCmsEditor"
                                    class="mt-1.5 flex cursor-pointer items-center text-zinc-400 hover:text-yellow-500 dark:hover:text-yellow-400"
                                    data-test="editButton"
                                >
                                    <PencilIcon class="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="mt-5 lg:mt-2">
                        <IgnorePagePadding
                            :mobileOnly="true"
                            :ignoreTop="true"
                        >
                            <VideoPlayer
                                v-if="content && content.video"
                                :content="content"
                                :language="selectedLanguageCode"
                            />
                            <div
                                v-else-if="content.parentId || content.parentImageData"
                                class="relative cursor-pointer overflow-hidden"
                                @click="
                                    () => {
                                        if (content)
                                            currentImageIndex = activeImageCollection(content);
                                        enableZoom = true;
                                    }
                                "
                            >
                                <LImage
                                    :image="content.parentImageData"
                                    :content-parent-id="content.parentId"
                                    :parent-image-bucket-id="content.parentImageBucketId"
                                    aspectRatio="video"
                                    size="post"
                                />
                                <div
                                    v-if="
                                        (content.parentImageData?.fileCollections?.length ?? 0) > 1
                                    "
                                    class="absolute bottom-2 right-2 flex items-center gap-1"
                                >
                                    <DocumentDuplicateIcon class="h-10 w-10 text-zinc-400" />
                                </div>

                                <!-- Small Play Audio Button (only show if content has audio but no video) -->
                                <button
                                    v-if="hasAudioFiles"
                                    @click.stop="
                                        (event) => {
                                            playAudio();
                                            // Prevent focus staying on button
                                            (event.target as HTMLElement).blur();
                                        }
                                    "
                                    class="absolute bottom-2.5 left-3.5 flex items-center justify-center gap-1.5 rounded-full bg-black/60 py-1 pl-2 pr-3.5 text-white shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-110 hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                    title="Play Audio"
                                >
                                    <SpeakerWaveIcon class="h-5 w-5" />
                                    {{ t("singlecontent.listen") }}
                                </button>
                            </div>
                        </IgnorePagePadding>
                    </div>

                    <div
                        v-if="content.summary"
                        class="mt-6 flex justify-center"
                    >
                        <p
                            class="max-w-2xl text-center text-lg leading-relaxed text-zinc-600 dark:text-slate-300"
                        >
                            {{ content.summary }}
                        </p>
                    </div>

                    <div class="mt-6 flex flex-col items-center gap-4">
                        <div
                            class="flex w-fit flex-wrap items-center justify-center gap-y-2 border-t-2 border-yellow-500/25 px-8 pt-6 text-sm text-zinc-500 dark:text-slate-400"
                        >
                            <!-- Author -->
                            <div
                                v-if="content.author"
                                class="flex items-center after:px-2 after:font-normal after:text-zinc-300 after:content-['•'] last:after:hidden dark:after:text-slate-700"
                            >
                                By {{ content.author }}
                            </div>

                            <!-- Reading Time -->
                            <div
                                v-if="readingTime && readingTime > 1"
                                class="flex items-center gap-1.5 after:px-2 after:text-zinc-300 after:content-['•'] last:after:hidden dark:after:text-slate-700"
                            >
                                <ClockIcon class="h-4 w-4 flex-shrink-0" />
                                <span>{{ readingTime }} min</span>
                            </div>

                            <!-- Publish Date -->
                            <div
                                v-if="content.publishDate && content.parentPublishDateVisible"
                                class="flex items-center text-center after:px-2 after:text-zinc-300 after:content-['•'] last:after:hidden dark:after:text-slate-700 sm:text-left"
                            >
                                {{
                                    content.publishDate
                                        ? db
                                              .toDateTime(content.publishDate)
                                              .toLocaleString(DateTime.DATETIME_MED)
                                        : ""
                                }}
                            </div>

                            <!-- Fallback language: shown when the article isn't available in a
                                 language the user chose (it fell through to the default / another).
                                 Renders nothing for chosen-language content, so no stray separator. -->
                            <FallbackLanguageBadge :content="content" />
                        </div>

                        <!-- Bookmark Button -->
                        <button
                            v-if="
                                !(content.parentPostType && content.parentPostType == PostType.Page)
                            "
                            @click="toggleBookmark"
                            data-test="bookmark"
                            class="flex items-center transition-colors"
                        >
                            <component
                                :is="isBookmarked ? BookmarkIconSolid : BookmarkIconOutline"
                                class="h-5 w-5"
                                :class="{
                                    'text-yellow-500': isBookmarked,
                                    'text-zinc-400 hover:text-zinc-600 dark:text-slate-500 dark:hover:text-slate-200':
                                        !isBookmarked,
                                }"
                            />
                        </button>
                    </div>

                    <div
                        class="mt-6 flex flex-wrap justify-center gap-2"
                        v-if="categoryTags.length"
                    >
                        <span
                            v-for="tag in categoryTags"
                            :key="tag._id"
                            @click="
                                selectedCategoryId = tag.parentId;
                                showCategoryModal = true;
                            "
                            class="flex cursor-pointer items-center justify-center rounded-lg border border-yellow-500/25 bg-yellow-500/10 py-1 pl-1 pr-2 text-sm hover:bg-yellow-100/25 dark:bg-slate-700 dark:hover:bg-yellow-100/25"
                        >
                            <TagIcon class="mr-2 h-5 w-5 text-yellow-500/75" />
                            <span class="line-clamp-1">{{ tag.title }}</span>
                        </span>
                    </div>

                    <!-- Render content with highlighting support -->
                    <LHighlightable
                        v-if="content.text"
                        :content-id="content._id"
                    >
                        <div
                            v-html="text"
                            class="prose prose-zinc mt-8 max-w-full dark:prose-invert lg:prose-lg prose-headings:font-bold prose-a:text-yellow-600 dark:prose-a:text-yellow-400"
                            :class="{
                                'border-t border-zinc-100 pt-8 dark:border-slate-800':
                                    categoryTags.length == 0,
                            }"
                        ></div> </LHighlightable
                    ><br />
                    <div
                        v-if="content.copyright"
                        class="text-xs text-zinc-500 dark:text-slate-300"
                    >
                        {{ content.copyright }}
                    </div>
                </article>
            </div>

            <RelatedContent
                v-if="content && tags.length"
                :selectedContent="content"
                :tags="
                    tags.filter(
                        (t: ContentDto) => t && t.parentTagType && t.parentTagType == TagType.Topic,
                    )
                "
            />
            <IgnorePagePadding ignoreBottom>
                <CopyrightBanner />
            </IgnorePagePadding>
        </div>
    </BasePage>

    <LModal
        :isVisible="showCategoryModal"
        @close="showCategoryModal = false"
        :heading="selectedCategory?.title || ''"
    >
        <div class="max-h-[calc(80%)] overflow-y-auto">
            <div class="">
                <VerticalTagViewer
                    v-if="selectedCategory"
                    :tag="selectedCategory"
                    class=""
                />
            </div>
        </div>
    </LModal>

    <ImageModal
        v-if="content && enableZoom"
        :content-parent-id="content.parentId"
        :parent-image-bucket-id="content.parentImageBucketId"
        :imageCollections="content?.parentImageData?.fileCollections"
        :currentIndex="currentImageIndex"
        aspectRatio="original"
        @update:index="currentImageIndex = $event"
        @close="enableZoom = false"
    />
</template>
