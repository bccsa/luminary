<script setup lang="ts">
import {
    DocType,
    PostType,
    PublishStatus,
    TagType,
    db,
    useDexieLiveQueryWithDeps,
    type ContentDto,
    type RedirectDto,
    type Uuid,
} from "luminary-shared";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import { computed, ref, watch } from "vue";
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { DateTime } from "luxon";
import { useRouter } from "vue-router";
import { appLanguageAsRef, appLanguageIdAsRef, appName } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import RelatedContent from "../components/content/RelatedContent.vue";
import VerticalTagViewer from "@/components/tags/VerticalTagViewer.vue";
import Link from "@tiptap/extension-link";
import LImage from "@/components/images/LImage.vue";
import { BookmarkIcon as BookmarkIconSolid } from "@heroicons/vue/24/solid";
import { BookmarkIcon as BookmarkIconOutline } from "@heroicons/vue/24/outline";
import { userPreferencesAsRef } from "@/globalConfig";

const router = useRouter();

type Props = {
    slug: string;
};
const props = defineProps<Props>();

const slug = ref(props.slug);
const docsBySlug = useDexieLiveQueryWithDeps(slug, (slug) =>
    db.docs.where("slug").equals(slug).toArray(),
);

const defaultContent: ContentDto = {
    // set to initial content (loading state)
    _id: "",
    type: DocType.Content,
    updatedTimeUtc: 0,
    memberOf: [],
    parentId: "",
    language: appLanguageIdAsRef.value,
    status: PublishStatus.Published,
    title: "Loading...",
    slug: "",
    publishDate: 0,
    parentTags: [],
};

const content = computed(() => {
    if (!docsBySlug.value) return defaultContent;
    if (!docsBySlug.value.length) return defaultContent;
    if (docsBySlug.value[0].type != DocType.Content) return defaultContent;
    return docsBySlug.value[0] as ContentDto;
});

const tags = useDexieLiveQueryWithDeps(
    [content, appLanguageIdAsRef],
    ([content, appLanguageId]: [ContentDto, Uuid]) =>
        db.docs
            .where("parentId")
            .anyOf(content.parentTags.concat([content.parentId])) // Include this document's parent ID to show content tagged with this document's parent (if a TagDto).
            .filter((t) => {
                const tag = t as ContentDto;
                if (tag.language != appLanguageId) return false;
                if (tag.parentType != DocType.Tag) return false;
                if (!tag.publishDate) return false;
                if (tag.publishDate > Date.now()) return false;
                if (tag.expiryDate && tag.expiryDate < Date.now()) return false;
                return true;
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: [] as ContentDto[] },
);

const selectedCategoryId = ref<Uuid | undefined>();

// Redirect to the correct page if this is a redirect
watch(docsBySlug, async () => {
    if (!docsBySlug.value) return;

    const redirect = docsBySlug.value.find(
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
});

// Todo: Create a isLoading ref in Luminary shared to determine if the content is still loading (waiting for data to stream from the API) before showing a 404 error.

const is404 = computed(() => {
    if (!content.value) return true; // if the content is not avaiable, it's a 404
    if (content.value.status != "published") return true; // if the content is not published, it's a 404
    if (content.value.publishDate && content.value.publishDate > Date.now()) return true; // if the content is scheduled for the future, it's a 404
    if (content.value.expiryDate && content.value.expiryDate < Date.now()) return true; // if the content is expired, it's a 404
    return false;
});

// Function to toggle bookmark for the current content
const toggleBookmark = () => {
    if (!userPreferencesAsRef.value.bookmarks) {
        userPreferencesAsRef.value.bookmarks = [];
    }

    if (isBookmarked.value) {
        // Remove from bookmarks
        userPreferencesAsRef.value.bookmarks = userPreferencesAsRef.value.bookmarks.filter(
            (bookmark) => bookmark.id != content.value.parentId,
        );
    } else {
        // Add to bookmarks
        userPreferencesAsRef.value.bookmarks.push({ id: content.value.parentId, ts: Date.now() });
        useNotificationStore().addNotification({
            id: "bookmark-added",
            title: "Bookmark added",
            description:
                "This content has been added to your bookmarks. You can find the bookmarks page from the profile menu.",
            state: "success",
            type: "toast",
            timeout: 5000,
        });
    }
};

// Check if the current content is bookmarked
const isBookmarked = computed(() => {
    return userPreferencesAsRef.value.bookmarks?.some(
        (bookmark) => bookmark.id == content.value.parentId,
    );
});

// Set document title and meta tags
watch([content, is404], () => {
    document.title = is404.value
        ? `Page not found - ${appName}`
        : `${content.value.seoTitle ? content.value.seoTitle : content.value.title} - ${appName}`;

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
    metaTag.setAttribute("content", content.value.seoString || content.value.summary || "");
});

// Redirect to preferred language
watch(
    () => [appLanguageAsRef.value, content.value.language],
    async () => {
        if (!content.value) return;

        if (appLanguageAsRef.value?._id != content.value.language) {
            const contentDocs = await db.whereParent(content.value.parentId);
            const preferred = contentDocs.find((c) => c.language == appLanguageAsRef.value?._id);

            if (preferred) {
                slug.value = preferred.slug;
                await router.replace({ name: "content", params: { slug: slug.value } });
                return;
            }
            useNotificationStore().addNotification({
                id: "translation-not-found",
                title: "Translation not found",
                description: `There is no ${appLanguageAsRef.value?.name} translation for this content.`,
                state: "error",
                type: "toast",
            });
        }
    },
);

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
    console.log(selectedCategoryId.value);
    return tags.value.find((t) => t.parentId == selectedCategoryId.value);
});
</script>

<template>
    <div class="hidden lg:block">
        <div
            @click="router.back()"
            class="-mx-2 mb-1 inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 dark:text-zinc-100 dark:hover:bg-zinc-500 dark:hover:text-zinc-50 dark:active:bg-zinc-400"
        >
            <ArrowLeftIcon class="h-4 w-4" />
            Back
        </div>
    </div>

    <NotFoundPage v-if="is404" />
    <div v-else class="mb-8 flex flex-col justify-center lg:flex-row lg:space-x-8">
        <article class="mb-12 w-full lg:w-3/4 lg:max-w-3xl" v-if="content">
            <VideoPlayer v-if="content.video" :content="content" />
            <LImage v-else :image="content.parentImageData" aspectRatio="video" size="post" />

            <h1 class="text-bold mt-4 text-center text-2xl text-zinc-800 dark:text-slate-50">
                {{ content.title }}
            </h1>

            <div data-test="bookmark" @click="toggleBookmark">
                <component
                    v-if="!(content.parentPostType && content.parentPostType == PostType.Page)"
                    :is="isBookmarked ? BookmarkIconSolid : BookmarkIconOutline"
                    class="mx-auto mt-2 h-6 w-6 cursor-pointer"
                    :class="{
                        'text-yellow-500': isBookmarked,
                    }"
                />
            </div>

            <div
                class="mt-1 text-center text-sm text-zinc-500 dark:text-slate-300"
                v-if="content.publishDate && content.parentPublishDateVisible"
            >
                {{
                    content.publishDate
                        ? db.toDateTime(content.publishDate).toLocaleString(DateTime.DATETIME_MED)
                        : ""
                }}
            </div>

            <div
                class="mt-12 text-justify text-gray-800 dark:text-slate-100"
                v-if="content.summary"
            >
                {{ content.summary }}
            </div>

            <div
                v-if="content.text"
                v-html="text"
                class="prose prose-zinc mt-6 max-w-full text-justify dark:prose-invert"
            ></div>
        </article>

        <div class="h-full w-full py-2 lg:mt-0 lg:w-1/4 lg:max-w-3xl">
            <div
                class="mb-2 flex flex-wrap border-b border-gray-200 text-center text-sm font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"
            >
                <span
                    v-for="tag in tags.filter(
                        (t: ContentDto) => t.parentTagType == TagType.Category,
                    )"
                    :key="tag._id"
                    @click="selectedCategoryId = tag.parentId"
                    class="me-2 flex cursor-pointer items-center justify-center rounded-t px-2 py-1 text-sm hover:bg-yellow-200 dark:hover:bg-yellow-100/25"
                    :class="{
                        ' bg-yellow-100 text-black shadow dark:bg-yellow-100/10 dark:text-white':
                            selectedCategoryId == tag.parentId,
                    }"
                >
                    {{ tag.title }}
                </span>
            </div>
            <VerticalTagViewer v-if="selectedCategory" :tag="selectedCategory" />
        </div>
    </div>

    <RelatedContent
        v-if="content && tags.length"
        :selectedContent="content"
        :tags="tags.filter((t) => t && t.parentTagType && t.parentTagType == TagType.Topic)"
    />
</template>
