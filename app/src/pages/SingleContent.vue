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
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import { computed, ref, watch } from "vue";
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
import { ListboxOption, ListboxButton, Listbox, ListboxOptions } from "@headlessui/vue";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";

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
                if (!docs?.length) return;

                // Check if the document is a redirect, and redirect to the new slug
                const redirect = docs.find(
                    (d) => d.type === DocType.Redirect,
                ) as unknown as RedirectDto;
                if (redirect) {
                    if (redirect.toSlug) {
                        router.replace({ name: "content", params: { slug: redirect.toSlug } });
                        return;
                    }
                    router.replace("/");
                    return;
                }

                return docs[0];
            }) as unknown as Promise<ContentDto | undefined>,
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

watch([content, isConnected], async () => {
    if (!content.value) return;

    if (isConnected.value) {
        // Load from API via live queries
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
            availableTranslations.value = contentResults.value as ContentDto[];
            if (contentResults.value && contentResults.value.length == 1) return;
            if (apiLanguage.value && Array.isArray(apiLanguage.value)) {
                languages.value = (apiLanguage.value as LanguageDto[]).filter((lang) =>
                    availableTranslations.value.some(
                        (translation) => translation.language === lang._id,
                    ),
                );
            }
        });
    } else {
        // Load from IndexedDB
        const [translations, langs] = await Promise.all([
            db.docs.where("parentId").equals(content.value.parentId).toArray(),
            db.docs.where("type").equals(DocType.Language).toArray(),
        ]);

        if (translations.length == 1) return;
        availableTranslations.value = translations as ContentDto[];

        // Filter languages based on available translations
        languages.value = (langs as LanguageDto[]).filter((lang) =>
            availableTranslations.value.some((translation) => translation.language === lang._id),
        );
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

setTimeout(() => {
    watch(
        [selectedLanguageId, content, appLanguagePreferredIdAsRef],
        async () => {
            if (!selectedLanguageId.value) return;
            if (!content.value) return;

            const preferred = availableTranslations.value.find(
                (c) => c.language == selectedLanguageId.value,
            );

            if (preferred) {
                // Check if the preferred translation is published
                router.replace({ name: "content", params: { slug: preferred.slug } });
            }

            if (content.value && content.value.language !== appLanguagePreferredIdAsRef.value) {
                const preferredContent = availableTranslations.value.find(
                    (c) => c.language == appLanguagePreferredIdAsRef.value,
                );

                const languageName =
                    languages.value.find((l) => l._id === preferredContent?.language)?.name ??
                    preferredContent?.language;

                // check if it is already in the preferred language and in the SingleContent page
                if (preferredContent && router.currentRoute.value.name == "content") {
                    useNotificationStore().addNotification({
                        id: "content-available",
                        title: "Content available",
                        description: `This content is also available in ${languageName}. Click here to view it.`,
                        state: "info",
                        type: "banner",
                        timeout: 5000,
                        closable: true,
                        link: {
                            name: "content",
                            params: { slug: preferredContent.slug },
                        },
                        openLink: true,
                    });
                }
            }

            const removeNotificationIfNeeded = () => {
                if (
                    (content.value &&
                        content.value.language == appLanguagePreferredIdAsRef.value) ||
                    router.currentRoute.value.name !== "content"
                ) {
                    // Remove the notification if the content is already in the preferred language
                    // or if the user navigates away from the "content" page
                    useNotificationStore().removeNotification("content-available");
                }
            };

            // Initial check to remove the notification if conditions are met
            removeNotificationIfNeeded();

            // Watch for route changes to remove the notification if the user navigates away
            watch(
                () => router.currentRoute.value.name,
                () => {
                    removeNotificationIfNeeded();
                },
            );
        },
        { immediate: true, deep: true },
    );
}, 1000);

watch(content, () => {
    selectedLanguageId.value = content.value?.language;
});

// Change language
const onLanguageSelect = (languageId: Uuid) => {
    selectedLanguageId.value = languageId;
    const preferred = availableTranslations.value.find(
        (c) => c.language == languageId && isPublished(c, appLanguageIdsAsRef.value),
    );
    if (preferred) {
        router.replace({ name: "content", params: { slug: preferred.slug } });
    }
};
</script>

<template>
    <BasePage :showBackButton="true">
        <template #quickControls v-if="!is404">
            <div class="relative">
                <!-- Replace your current language dropdown template with this: -->
                <Listbox v-model="selectedLanguageId" @update:model-value="onLanguageSelect">
                    <div class="relative mt-1 w-auto">
                        <ListboxButton>
                            <span class="block truncate">
                                <span class="hidden text-zinc-400 dark:text-slate-300 sm:inline">
                                    {{
                                        languages.find((lang) => lang._id === selectedLanguageId)
                                            ?.name
                                    }}
                                </span>
                                <span class="inline text-zinc-400 dark:text-slate-300 sm:hidden">
                                    {{
                                        languages
                                            .find((lang) => lang._id === selectedLanguageId)
                                            ?.languageCode.toUpperCase()
                                    }}
                                </span>
                            </span>
                        </ListboxButton>

                        <Transition
                            enter="transition ease-out duration-100"
                            enter-from="opacity-0 scale-95"
                            enter-to="opacity-100 scale-100"
                            leave="transition ease-in duration-75"
                            leave-from="opacity-100 scale-100"
                            leave-to="opacity-0 scale-95"
                        >
                            <ListboxOptions
                                class="max-h-auto absolute right-0 z-10 mt-1 w-auto overflow-auto rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-slate-700"
                            >
                                <ListboxOption
                                    v-for="language in languages"
                                    :key="language._id"
                                    :value="language._id"
                                    class="flex cursor-pointer select-none items-center gap-2 px-4 py-2 text-sm leading-6 text-zinc-800 hover:bg-zinc-50 dark:text-white dark:hover:bg-slate-600"
                                >
                                    {{ language.name }}
                                    <CheckCircleIcon
                                        v-if="selectedLanguageId === language._id"
                                        class="h-5 w-5 text-yellow-500"
                                    />
                                </ListboxOption>
                            </ListboxOptions>
                        </Transition>
                    </div>
                </Listbox>
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
                        <VideoPlayer v-if="content.video" :content="content" />
                        <!-- Ensure content.parentId does not contain default content empty string -->
                        <LImage
                            v-else-if="content.parentId || content.parentImageData"
                            :image="content.parentImageData"
                            :content-parent-id="content.parentId"
                            aspectRatio="video"
                            size="post"
                            @click="enableZoom = true"
                        />
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
                :tags="tags.filter((t) => t && t.parentTagType && t.parentTagType == TagType.Topic)"
            />
        </div>
        <template #footer>
            <CopyrightBanner />
        </template>
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
        v-if="content?.parentImageData && enableZoom"
        :content-parent-id="content.parentId"
        :image="content.parentImageData"
        aspectRatio="video"
        size="post"
        @close="enableZoom = false"
        @keydown.esc="enableZoom = false"
    />
</template>
