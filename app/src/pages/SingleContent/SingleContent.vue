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
import { CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/vue/20/solid";
import { markLanguageSwitch } from "@/util/isLangSwitch";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { activeImageCollection } from "@/components/images/LImageProvider.vue";

// External referrer helper
const isExternalReferrer = (): boolean => {
    const referrer = document.referrer;

    // No referrer = direct link/bookmark = treat as external
    if (!referrer) return true;

    try {
        const refURL = new URL(referrer);
        const currentURL = new URL(window.location.href);

        // Compare origins (protocol + hostname + port)
        return refURL.origin !== currentURL.origin;
    } catch {
        // If URL parsing fails, treat as external for safety
        return true;
    }
};
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

                const redirect = docs.find((d) => d.type === DocType.Redirect) as
                    | RedirectDto
                    | undefined;
                if (redirect && redirect.toSlug) {
                    const routes = router.getRoutes();
                    const targetRoute = routes.find((r) => r.name === redirect.toSlug);
                    if (targetRoute) {
                        router.replace({ name: redirect.toSlug });
                    } else {
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

    if (!isConnected.value) {
        content.value = undefined;
        return;
    }

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

        content.value = apiContent.value as ContentDto;
    });
});

// Load available languages
const currentParentId = ref<string>("");
const isLoadingTranslations = ref(false);

watch([content, isConnected], async () => {
    if (!content.value) return;

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

            isLoadingTranslations.value = false;
        });
    }
});

const tags = useDexieLiveQueryWithDeps(
    [content, appLanguageIdsAsRef],
    ([content, appLanguageIds]: [ContentDto, Uuid[]]) =>
        db.docs
            .where("parentId")
            .anyOf((content?.parentTags || []).concat([content?.parentId || ""]))
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

const toggleBookmark = () => {
    if (!userPreferencesAsRef.value.bookmarks) {
        userPreferencesAsRef.value.bookmarks = [];
    }

    if (isBookmarked.value) {
        userPreferencesAsRef.value.bookmarks = userPreferencesAsRef.value.bookmarks.filter(
            (b) => b.id != content.value?.parentId,
        );
    } else {
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

const isBookmarked = computed(() => {
    return userPreferencesAsRef.value.bookmarks?.some((b) => b.id == content.value?.parentId);
});

watch([content, is404], () => {
    if (content.value) isLoading.value = false;

    document.title = is404.value
        ? `Page not found - ${appName}`
        : `${content.value?.seoTitle || content.value?.title} - ${appName}`;

    if (is404.value) return;

    let metaTag = document.querySelector("meta[name='description']");
    if (!metaTag) {
        metaTag = document.createElement("meta");
        metaTag.setAttribute("name", "description");
        document.head.appendChild(metaTag);
    }
    metaTag.setAttribute("content", content.value?.seoString || content.value?.summary || "");
});

const text = computed(() => {
    if (!content.value?.text) return "";
    try {
        const json = JSON.parse(content.value.text);
        return generateHTML(json, [StarterKit, Link]);
    } catch {
        return content.value.text;
    }
});

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

watch(
    () => [content.value, appLanguagePreferredIdAsRef.value],
    ([newContent, preferredId]) => {
        if (!newContent) return;
        const currentContent = newContent as ContentDto;

        const preferredLanguageChanged = previousPreferredId.value !== preferredId;
        previousPreferredId.value = preferredId as string;

        if (preferredLanguageChanged && hasAutoNavigated.value) {
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

        if (!hasAutoNavigated.value) {
            hasAutoNavigated.value = true;
            const preferredTranslation = availableTranslations.value.find(
                (t) => t.language === preferredId,
            );
            if (preferredTranslation && preferredTranslation.slug !== currentContent.slug) {
                router.replace({ name: "content", params: { slug: preferredTranslation.slug } });
                return;
            }
        }

        selectedLanguageId.value = currentContent.language;
    },
    { immediate: true },
);

const openedFromExternalLink = ref(false);

onMounted(() => {
    openedFromExternalLink.value = isExternalReferrer();
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
                <article class="w-full lg:w-3/4 lg:max-w-3xl" v-if="content">
                    <IgnorePagePadding :mobileOnly="true" :ignoreTop="true">
                        <VideoPlayer
                            v-if="content.video"
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
                                aspectRatio="video"
                                size="post"
                            />
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
