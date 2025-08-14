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
import { computed, defineAsyncComponent, onMounted, ref, watch } from "vue";
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
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
} from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import RelatedContent from "../components/content/RelatedContent.vue";
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
import { CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/vue/20/solid";
import {
    markLanguageSwitch,
    consumeLanguageSwitchFlag,
    isLanguageSwitchRef,
} from "@/util/isLangSwitch";
import LoadingSpinner from "@/components/LoadingSpinner.vue";

const VideoPlayer = defineAsyncComponent({
    loader: () => import("@/components/content/VideoPlayer.vue"),
    loadingComponent: LoadingSpinner,
});

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
    // set to initial content (loading state)
    _id: "",
    type: DocType.Content,
    updatedTimeUtc: 0,
    memberOf: [],
    parentId: "",
    language: appLanguagePreferredIdAsRef.value ? appLanguagePreferredIdAsRef.value : "",
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
                if (!docs?.length) {
                    router.replace("/");
                    return undefined;
                }

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

                // Return the first content doc (normal case)
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

    const query = ref<ApiSearchQuery>({
        slug: props.slug,
    });

    const apiLiveQuery = new ApiLiveQuery(query, {
        initialValue: [defaultContent] as BaseDocumentDto[],
    });
    const apiContent = apiLiveQuery.toRef();

    watch(apiContent, () => {
        if (!apiContent.value) {
            content.value = undefined;
            return;
        }
        // Check if the returned content is a redirect, and redirect to the new slug
        if (apiContent.value?.type == DocType.Redirect) {
            const redirect = apiContent.value as unknown as RedirectDto;
            if (redirect.toSlug) {
                router.replace({ name: "content", params: { slug: redirect.toSlug } });
                return;
            }
            router.replace("/");
            return;
        }

        // If the content is not a redirect, set it to the content ref
        content.value = apiContent.value as ContentDto;
    });
});

// Load available languages from IndexedDB immediately (even when online)
watch([content, isConnected], async () => {
    if (!content.value) return;

    // Load from IndexedDB
    const [translations, langs] = await Promise.all([
        db.docs.where("parentId").equals(content.value.parentId).toArray(),
        db.docs.where("type").equals(DocType.Language).toArray(),
    ]);

    //
    if (translations.length > 1) {
        availableTranslations.value = translations as ContentDto[];

        // Filter languages based on available translations
        languages.value = (langs as LanguageDto[]).filter((lang) =>
            availableTranslations.value.some((translation) => translation.language === lang._id),
        );
    }

    if (isConnected.value) {
        // If online, do API call to get list of available languages and update dropdown
        const languageQuery = ref<ApiSearchQuery>({
            types: [DocType.Language],
        });

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
                availableTranslations.value = contentResults.value as ContentDto[];
            }

            if (apiLanguage.value && Array.isArray(apiLanguage.value)) {
                const apiLanguages = apiLanguage.value as LanguageDto[];

                // Merge languages from API with those from IndexedDB, filtering out duplicates
                const mergedLanguages = [
                    ...languages.value,
                    ...apiLanguages.filter(
                        (apiLang) =>
                            !languages.value.some((localLang) => localLang._id === apiLang._id),
                    ),
                ];

                languages.value = mergedLanguages;
            }
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
    return (
        !content.value || !isPublished(content.value, content.value ? [content.value.language] : [])
    );
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
            (bookmark) => bookmark.id != content.value?.parentId,
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
    return userPreferencesAsRef.value.bookmarks?.some(
        (bookmark) => bookmark.id == content.value?.parentId,
    );
});

// Set document title and meta tags
watch([content, is404], () => {
    if (content.value) {
        isLoading.value = false; // Content is loaded
    }

    document.title = is404.value
        ? `Page not found - ${appName}`
        : `${content.value?.seoTitle ? content.value.seoTitle : content.value?.title} - ${appName}`;

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
    if (!content.value || !content.value.text) {
        return "";
    }

    let text;

    // only parse text with TipTap if it's JSON, otherwise we render it out as HTML
    try {
        text = JSON.parse(content.value.text);
    } catch {
        return content.value.text;
    }
    return generateHTML(text, [StarterKit, Link]);
});

// Select the first category in the content by category list on load
watch(tags, () => {
    if (selectedCategoryId.value) return;
    const categories = tags.value.filter((t) => t.parentTagType == TagType.Category);
    if (categories.length) {
        selectedCategoryId.value = categories[0].parentId;
    }
});

const selectedCategory = computed(() => {
    if (!selectedCategoryId.value) return undefined;
    return tags.value.find((t) => t.parentId == selectedCategoryId.value);
});

/**
 * Watches for changes in the `content` reactive property.
 * When `content` is updated, it sets the `selectedLanguageId`
 * to the `language` property of the new `content` value, if available.
 */
watch(content, () => {
    selectedLanguageId.value = content.value?.language;
});

const hasConsumedLangSwitch = ref(false);

// Change language
const onLanguageSelect = (languageId: Uuid) => {
    markLanguageSwitch(); // reactive version without argument
    selectedLanguageId.value = languageId;

    // Prevent route change by not replacing the slug
    const preferred = availableTranslations.value.find((c) => c.language === languageId);

    if (preferred && preferred.slug !== content.value?.slug) {
        // Update content without triggering a route change
        content.value = preferred;
    }
};

watch(
    [selectedLanguageId, content, appLanguagePreferredIdAsRef, availableTranslations],
    () => {
        if (!selectedLanguageId.value || !content.value) return;

        const preferred = availableTranslations.value.find(
            (c) => c.language === selectedLanguageId.value,
        );

        // Route only if different slug
        if (preferred && preferred.slug !== content.value.slug) {
            router.replace({ name: "content", params: { slug: preferred.slug } });
            return;
        }

        // Consume the language switch flag only once to determine if the user switched language via dropdown
        if (!hasConsumedLangSwitch.value) {
            isLanguageSwitchRef.value = consumeLanguageSwitchFlag();
            hasConsumedLangSwitch.value = true;
        }

        // Show banner only if it wasn't from dropdown AND there's actually a different slug to navigate to
        if (
            content.value.language !== appLanguagePreferredIdAsRef.value &&
            !isLanguageSwitchRef.value
        ) {
            const preferredContent = availableTranslations.value.find(
                (c) => c.language === appLanguagePreferredIdAsRef.value,
            );

            // Only show banner if there's a preferred language version with a *different* slug
            if (preferredContent && preferredContent.slug !== content.value.slug) {
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
                        link: {
                            name: "content",
                            params: { slug: preferredContent.slug },
                        },
                        openLink: true,
                    });
                }, 3000);
            }
        }

        // Remove banner if user views content in preferred language
        const removeNotificationIfNeeded = () => {
            if (content.value?.language === appLanguagePreferredIdAsRef.value) {
                useNotificationStore().removeNotification("content-available");
            }
        };

        removeNotificationIfNeeded();

        watch(
            () => router.currentRoute.value.name,
            () => {
                removeNotificationIfNeeded();
            },
        );
    },
    { immediate: true, deep: true },
);

const showDropdown = ref(false);
// Simple dropdown close on click outside using Vue's global event
function onClickOutside(event: MouseEvent) {
    const dropdown = document.querySelector("[name='translationSelector']");
    if (showDropdown.value && dropdown && !dropdown.contains(event.target as Node)) {
        showDropdown.value = false;
    }
}

onMounted(() => {
    window.addEventListener("click", onClickOutside);
});

// Convert selectedLanguageId to language code for VideoPlayer
const selectedLanguageCode = computed(() => {
    if (!selectedLanguageId.value || !languages.value.length) return null;
    const selectedLang = languages.value.find((lang) => lang._id === selectedLanguageId.value);
    return selectedLang?.languageCode || null;
});
</script>

<template>
    <BasePage :showBackButton="true">
        <template #quickControls v-if="!is404">
            <div class="relative w-auto">
                <button
                    v-show="availableTranslations.length > 1"
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
                        @click="
                            onLanguageSelect(language._id);
                            showDropdown = false;
                        "
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

        <div class="absolute hidden lg:block">
            <div
                @click="router.back()"
                class="-mx-2 mb-1 inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 dark:text-zinc-100 dark:hover:bg-zinc-500 dark:hover:text-zinc-50 dark:active:bg-zinc-400"
            >
                <ArrowLeftIcon class="h-4 w-4" />
                Back
            </div>
        </div>

        <NotFoundPage v-if="is404" />

        <div v-else class="flex min-h-full flex-col gap-6" :class="{ 'mb-6': !tags.length }">
            <div class="flex flex-grow justify-center">
                <article class="w-full lg:w-3/4 lg:max-w-3xl" v-if="content">
                    <IgnorePagePadding :mobileOnly="true" :ignoreTop="true">
                        <VideoPlayer
                            v-if="content.video"
                            :content="content"
                            :language="selectedLanguageCode"
                        />
                        <!-- Ensure content.parentId does not contain default content empty string -->
                        <div
                            v-else-if="content.parentId || content.parentImageData"
                            class="relative cursor-pointer"
                            @click="
                                () => {
                                    if (content) {
                                        currentImageIndex = activeImageCollection(content);
                                    }
                                    enableZoom = true;
                                }
                            "
                        >
                            <!-- Main Image -->
                            <LImage
                                :image="content.parentImageData"
                                :content-parent-id="content.parentId"
                                aspectRatio="video"
                                size="post"
                            />

                            <!-- Icon to indicate multiple images -->
                            <div
                                v-if="(content.parentImageData?.fileCollections?.length ?? 0) > 1"
                                class="absolute bottom-2 right-2 flex items-center gap-1"
                            >
                                <DocumentDuplicateIcon class="h-10 w-10 text-zinc-400" />
                            </div>
                        </div>
                    </IgnorePagePadding>

                    <div class="flex w-full flex-col items-center">
                        <div class="mt-3 flex flex-col gap-3">
                            <h1
                                class="text-bold text-center text-xl text-zinc-800 dark:text-slate-50 lg:text-2xl"
                            >
                                {{ content.title }}
                            </h1>
                            <div
                                v-if="content.author"
                                class="-mt-3 text-center text-xs text-zinc-500 dark:text-slate-300"
                            >
                                By {{ content.author }}
                            </div>

                            <div
                                class="-mt-2 text-center text-xs text-zinc-500 dark:text-slate-300"
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
                                        <!-- :class=["border border-transparent border-r-zinc-600 pr-1"] -->
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
                                            :class="{
                                                'text-yellow-500': isBookmarked,
                                            }"
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

                    <!-- Category tag buttons -->
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
                            <TagIcon class="mr-2 h-5 w-5 text-yellow-500/75" /><span
                                class="line-clamp-1"
                                >{{ tag.title }}</span
                            >
                        </span>
                    </div>

                    <div
                        v-if="content.text"
                        v-html="text"
                        class="prose prose-zinc mt-3 max-w-full dark:prose-invert"
                        :class="{
                            'border-t-2 border-yellow-500/25 pt-2': categoryTags.length == 0,
                        }"
                    ></div>
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
        </div>

        <IgnorePagePadding ignoreBottom>
            <CopyrightBanner />
        </IgnorePagePadding>
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
        :imageCollections="content?.parentImageData?.fileCollections"
        :currentIndex="currentImageIndex"
        aspectRatio="original"
        @update:index="currentImageIndex = $event"
        @close="enableZoom = false"
    />
</template>
