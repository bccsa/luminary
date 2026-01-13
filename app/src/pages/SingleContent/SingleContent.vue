<script setup lang="ts">
import {
    ApiLiveQuery,
    type ApiSearchQuery,
    DocType,
    PostType,
    PublishStatus,
    TagType,
    db,
    isConnected,
    useDexieLiveQuery,
    useDexieLiveQueryWithDeps,
    type BaseDocumentDto,
    type ContentDto,
    type RedirectDto,
    type Uuid,
    type LanguageDto,
} from "luminary-shared";
import { computed, onMounted, ref, watch } from "vue";
import { BookmarkIcon as BookmarkIconSolid, TagIcon, SunIcon } from "@heroicons/vue/24/solid";
import { BookmarkIcon as BookmarkIconOutline, MoonIcon } from "@heroicons/vue/24/outline";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { DateTime } from "luxon";
import { useRouter } from "vue-router";
import {
    appLanguageIdsAsRef,
    appName,
    appLanguagePreferredIdAsRef,
    isDarkTheme,
    theme,
    appLanguageAsRef,
    queryParams,
    addToMediaQueue,
} from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import RelatedContent from "@/components/content/RelatedContent.vue";
import VerticalTagViewer from "@/components/tags/VerticalTagViewer.vue";
import Link from "@tiptap/extension-link";
import LImage from "@/components/images/LImage.vue";

import { userPreferencesAsRef } from "@/globalConfig";
import { isPublished } from "@/util/isPublished";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import LModal from "@/components/form/LModal.vue";
import CopyrightBanner from "@/components/content/CopyrightBanner.vue";
import { useI18n } from "vue-i18n";
import ImageModal from "@/components/images/ImageModal.vue";
import BasePage from "@/components/BasePage.vue";
import { CheckCircleIcon, DocumentDuplicateIcon, SpeakerWaveIcon } from "@heroicons/vue/20/solid";
import { markLanguageSwitch } from "@/util/isLangSwitch";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { activeImageCollection } from "@/components/images/LImageProvider.vue";
import { isExternalNavigation } from "@/router";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import LHighlightable from "@/components/common/LHighlightable.vue";

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

const idbContent = useDexieLiveQuery(
    () =>
        db.docs
            .where("slug")
            .equals(props.slug)
            .toArray()
            .then((docs) => {
                if (!docs?.length) return undefined;

                // Check if the document is a redirect
                const redirect = docs.find((d) => d.type === DocType.Redirect) as
                    | RedirectDto
                    | undefined;
                if (redirect && redirect.toSlug) {
                    // If toSlug matches a route name, redirect to that route
                    const routes = router.getRoutes();
                    const targetRoute = routes.find((r) => r.name === redirect.toSlug);
                    if (targetRoute) {
                        router.replace({ name: redirect.toSlug });
                    } else {
                        // Otherwise, treat as a content slug
                        router.replace({ name: "content", params: { slug: redirect.toSlug } });
                    }
                    return undefined;
                }

                return docs.find((d) => d.type === DocType.Content) as ContentDto | undefined;
            }),
    { initialValue: defaultContent },
);

const unwatch = watch([idbContent, isConnected], () => {
    if (idbContent.value) {
        content.value = idbContent.value;
        return;
    }

    // If not connected, we don't want to fetch from the API, and as no content is found in IndexedDB, we clear the content
    if (!isConnected.value) {
        content.value = undefined;
        return;
    }

    // Stop the watcher on the IndexedDB content and start a new one on the API content
    unwatch();

    const query = ref<ApiSearchQuery>({ slug: props.slug });
    const apiLiveQuery = new ApiLiveQuery(query, {
        initialValue: [defaultContent] as BaseDocumentDto[],
    });
    const apiContent = apiLiveQuery.toRef();

    watch(apiContent, () => {
        if (!apiContent.value) {
            content.value = undefined;
            return;
        }

        if (apiContent.value.type === DocType.Redirect) {
            const redirect = apiContent.value as unknown as RedirectDto;
            if (redirect.toSlug) {
                router.replace({ name: "content", params: { slug: redirect.toSlug } });
                return;
            }
        }

        // If the content is not a redirect, set it to the content ref
        content.value = apiContent.value as ContentDto;
    });
});

// Load available languages from IndexedDB immediately (even when online)
const currentParentId = ref<string>("");
const isLoadingTranslations = ref(false);

watch([content, isConnected], async () => {
    if (!content.value) return;

    // Only reload translations if we're viewing a different parent content
    // This prevents flash when switching between translations of the same content
    if (
        currentParentId.value === content.value.parentId &&
        availableTranslations.value.length > 0
    ) {
        return;
    }

    currentParentId.value = content.value.parentId;
    isLoadingTranslations.value = true;

    const [availableContentTranslations, availableLanguages] = await Promise.all([
        db.docs.where("parentId").equals(content.value.parentId).toArray(),
        db.docs.where("type").equals(DocType.Language).toArray(),
    ]);

    if (availableContentTranslations.length > 1) {
        availableTranslations.value = availableContentTranslations as ContentDto[];
        languages.value = (availableLanguages as LanguageDto[]).filter((lang) =>
            availableTranslations.value.some((t) => t.language === lang._id),
        );
    }

    isLoadingTranslations.value = false;

    if (isConnected.value) {
        // If online, do API call to get list of available languages and update dropdown
        isLoadingTranslations.value = true;

        const languageQuery = ref<ApiSearchQuery>({ types: [DocType.Language] });
        const contentQuery = ref<ApiSearchQuery>({
            types: [DocType.Content],
            parentId: content.value.parentId,
        });

        const contentLiveQuery = new ApiLiveQuery(contentQuery);
        const apiLanguageLiveQuery = new ApiLiveQuery(languageQuery);

        const contentResults = contentLiveQuery.toArrayAsRef();
        const apiLanguage = apiLanguageLiveQuery.toArrayAsRef();

        watch([contentResults, apiLanguage], () => {
            if (contentResults.value && contentResults.value.length > 1) {
                availableTranslations.value = (contentResults.value as ContentDto[]).filter(
                    (c) => c.status === PublishStatus.Published,
                );
            }

            if (apiLanguage.value && Array.isArray(apiLanguage.value)) {
                const apiLanguages = apiLanguage.value as LanguageDto[];
                languages.value = apiLanguages.filter((lang) =>
                    availableTranslations.value.some((t) => t.language === lang._id),
                );
            }

            // Mark translations as loaded once we have data from the API
            isLoadingTranslations.value = false;
        });
    }
});

const tags = useDexieLiveQueryWithDeps(
    [content, appLanguageIdsAsRef],
    ([content, appLanguageIds]: [ContentDto, Uuid[]]) =>
        db.docs
            .where("parentId")
            .anyOf((content?.parentTags || []).concat([content?.parentId || ""])) // Include this document's parent ID to show content tagged with this document's parent (if a TagDto).
            .filter((t) => {
                const tag = t as ContentDto;
                if (tag.parentType != DocType.Tag) return false;
                return isPublished(tag, appLanguageIds);
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: [] as ContentDto[] },
);

const categoryTags = computed(() => tags.value.filter((t) => t.parentTagType == TagType.Category));
const selectedCategoryId = ref<Uuid | undefined>();

// If connected, we are waiting for data to load from the API, unless found in IndexedDB
const isLoading = ref(isConnected.value);
const is404 = ref(false);

const check404 = () => {
    if (isLoading.value) return false; // Don't show 404 during loading

    // If content is undefined (not Sifound), show 404
    if (!content.value) return true;

    // If content is still the default loading content, don't show 404 yet
    if (content.value === defaultContent) return false;

    // Check if content is published
    return !isPublished(content.value, [content.value.language]);
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

const text = computed(() => {
    // only parse text with TipTap if it's JSON, otherwise we render it out as HTML
    if (!content.value?.text) return "";
    try {
        const json = JSON.parse(content.value.text);
        return generateHTML(json, [StarterKit, Link]);
    } catch {
        return content.value.text;
    }
});

/**
 * Parses the content text as JSON if it's valid JSON format (TipTap editor format).
 * Returns undefined if the content is missing, has no text, or is not valid JSON.
 *
 * @returns {Object|undefined} The parsed JSON content object, or undefined if parsing fails or content is missing
 */
const parsedContent = computed(() => {
    if (!content.value || !content.value.text) {
        return undefined;
    }

    try {
        return JSON.parse(content.value.text);
    } catch {
        return undefined;
    }
});

/**
 * Converts the parsed TipTap content into individual HTML blocks.
 * Each block contains the generated HTML, the original node data, and a unique ID.
 * This is used for rendering content with highlighting support (via LHighlightable).
 *
 * @returns {Array<{id: string, html: string, node: any}>} Array of content blocks with:
 *   - id: Unique identifier for the block (format: "block-{index}")
 *   - html: Generated HTML string from the TipTap node
 *   - node: Original TipTap node data
 * @returns {Array} Empty array if parsedContent is undefined or has no content property
 */
const contentBlocks = computed(() => {
    if (!parsedContent.value || !parsedContent.value.content) {
        return [];
    }

    return parsedContent.value.content.map((node: any, index: number) => {
        const html = generateHTML({ type: "doc", content: [node] }, [StarterKit, Link]);
        return { id: `block-${index}`, html, node };
    });
});

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
    window.addEventListener("click", onClickOutside);
});

// Quick language switch (dropdown)
watch(selectedLanguageId, (newId) => {
    if (!newId || !content.value) return;

    const target = availableTranslations.value.find((c) => c.language === newId);
    if (!target || target.slug === content.value.slug) return;

    content.value = target;
    const newUrl = router.resolve({ name: "content", params: { slug: target.slug } }).href;
    window.history.replaceState(window.history.state, "", newUrl);
});

// Show banner: only external + preferred lang exists + different slug
watch(
    () => [
        content.value,
        appLanguagePreferredIdAsRef.value,
        openedFromExternalLink.value,
        availableTranslations.value,
    ],
    ([cur, prefId, external, translations]) => {
        if (!cur || !prefId || !external) return;
        const currentContent = cur as ContentDto;
        if (currentContent.language === prefId) return;

        const preferred = (translations as ContentDto[]).find(
            (t) => t.language === prefId && t.slug !== currentContent.slug,
        );

        if (!preferred) return;

        setTimeout(() => {
            useNotificationStore().addNotification({
                id: "content-available",
                title: t("notification.translation_available.title"),
                description: t("notification.translation_available.description", {
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

function onClickOutside(event: MouseEvent) {
    const dropdown = document.querySelector("[name='translationSelector']");
    if (showDropdown.value && dropdown && !dropdown.contains(event.target as Node)) {
        showDropdown.value = false;
    }
}

onMounted(() => {
    window.addEventListener("click", onClickOutside);
});

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

// Check if the current content has audio files
const hasAudioFiles = computed(() => {
    return !!(
        content.value?.parentMedia?.fileCollections &&
        content.value.parentMedia.fileCollections.length > 0
    );
});

// Function to start playing audio
const playAudio = () => {
    if (content.value && hasAudioFiles.value) {
        addToMediaQueue(content.value);
    }
};
</script>

<template>
    <BasePage :showBackButton="true">
        <template #quickControls v-if="!is404">
            <div class="relative w-auto">
                <button
                    v-show="
                        !isLoading && !isLoadingTranslations && availableTranslations.length > 1
                    "
                    name="translationSelector"
                    @click="showDropdown = !showDropdown"
                    class="block truncate text-zinc-400 hover:text-zinc-500 dark:text-slate-300 hover:dark:text-slate-200"
                    data-test="translationSelector"
                >
                    <span class="hidden sm:inline">
                        {{
                            languages.find((lang: LanguageDto) => lang._id === selectedLanguageId)
                                ?.name
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
                <div
                    v-if="showDropdown"
                    class="absolute right-0 z-10 mt-1 w-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-slate-700"
                >
                    <div
                        v-for="language in languages"
                        :key="language._id"
                        @click="quickLanguageSwitch(language._id)"
                        class="flex cursor-pointer select-none items-center gap-2 px-4 py-2 text-sm leading-6 text-zinc-800 hover:bg-zinc-50 dark:text-white dark:hover:bg-slate-600"
                        data-test="translationOption"
                    >
                        {{ language.name }}
                        <CheckCircleIcon
                            v-if="selectedLanguageId === language._id"
                            class="h-5 w-5 text-yellow-500"
                            aria-hidden="true"
                        />
                    </div>
                </div>
            </div>
            <div class="text-zinc-400 dark:text-slate-300" data-test="themeButton">
                <SunIcon class="h-6 w-6" v-if="isDarkTheme" @click="theme = 'light'" />
                <MoonIcon class="h-6 w-6" v-else @click="theme = 'dark'" />
            </div>
        </template>

        <NotFoundPage v-if="is404" />

        <div v-else class="flex min-h-full flex-col gap-6" :class="{ 'mb-6': !tags.length }">
            <div class="flex flex-grow justify-center">
                <LoadingSpinner v-if="isLoading" />
                <article class="w-full lg:w-3/4 lg:max-w-3xl" v-else-if="!isLoading && content">
                    <IgnorePagePadding :mobileOnly="true" :ignoreTop="true">
                        <VideoPlayer
                            v-if="content && content.video"
                            :content="content"
                            :language="selectedLanguageCode"
                        />
                        <div
                            v-else-if="content.parentId || content.parentImageData"
                            class="relative cursor-pointer"
                            @click="
                                () => {
                                    if (content) currentImageIndex = activeImageCollection(content);
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
                                v-if="(content.parentImageData?.fileCollections?.length ?? 0) > 1"
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
                                class="absolute bottom-2.5 left-3.5 flex items-center justify-center gap-1 rounded-full bg-black/60 px-2 py-1 text-white shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-110 hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                title="Play Audio"
                            >
                                <SpeakerWaveIcon class="h-5 w-5" />
                                Listen
                            </button>
                        </div>
                    </IgnorePagePadding>

                    <div class="flex w-full flex-col items-center">
                        <div
                            class="mt-3 flex flex-col"
                            :class="{
                                'gap-1': !content.publishDate || !content.parentPublishDateVisible,
                                'gap-3': content.publishDate && content.parentPublishDateVisible,
                            }"
                        >
                            <h1
                                class="text-bold text-center text-xl text-zinc-800 dark:text-slate-50 lg:text-2xl"
                            >
                                {{ content.title }}
                            </h1>
                            <div
                                v-if="content.author"
                                class="text-center text-xs text-zinc-500 dark:text-slate-300"
                            >
                                By {{ content.author }}
                            </div>
                            <div
                                class="text-center text-xs text-zinc-500 dark:text-slate-300"
                                v-if="content.publishDate && content.parentPublishDateVisible"
                            >
                                {{
                                    content.publishDate
                                        ? db
                                              .toDateTime(content.publishDate)
                                              .toLocaleString(DateTime.DATETIME_MED)
                                        : ""
                                }}
                            </div>
                            <div class="items-center">
                                <div class="flex justify-center">
                                    <div @click="toggleBookmark" data-test="bookmark">
                                        <component
                                            v-if="
                                                !(
                                                    content.parentPostType &&
                                                    content.parentPostType == PostType.Page
                                                )
                                            "
                                            :is="
                                                isBookmarked
                                                    ? BookmarkIconSolid
                                                    : BookmarkIconOutline
                                            "
                                            class="h-6 w-6 cursor-pointer"
                                            :class="{ 'text-yellow-500': isBookmarked }"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div
                                class="text-center text-sm text-zinc-800 dark:text-slate-200"
                                v-if="content.summary"
                            >
                                {{ content.summary }}
                            </div>
                        </div>
                    </div>

                    <div
                        class="mt-3 flex flex-wrap justify-center gap-1 border-t-2 border-yellow-500/25 pt-4 text-sm font-medium text-zinc-800 dark:text-slate-200"
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
                    <LHighlightable v-if="content.text" :content-id="content._id">
                        <div
                            v-html="
                                content.text && contentBlocks.length > 0
                                    ? contentBlocks.map((block: any) => block.html).join('')
                                    : text
                            "
                            class="prose prose-zinc mt-3 max-w-full dark:prose-invert"
                            :class="{
                                'border-t-2 border-yellow-500/25 pt-2': categoryTags.length == 0,
                            }"
                        ></div>
                    </LHighlightable>
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
                <VerticalTagViewer v-if="selectedCategory" :tag="selectedCategory" class="" />
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
