<script setup lang="ts">
import { DocType, TagType, db, type ContentDto, type TagDto, type Uuid } from "luminary-shared";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import { computed, ref, watch } from "vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
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

const router = useRouter();

type Props = {
    slug: string;
};
const props = defineProps<Props>();

const content = db.getBySlugAsRef<ContentDto>(props.slug);
const tagsContent = ref<ContentDto[]>([]);
const selectedTagId = ref<Uuid | undefined>();
const tags = ref<TagDto[]>([]);
const hasContent = ref(false);

const isExpiredOrScheduled = computed(() => {
    if (!content.value) return false;
    return (
        (content.value.publishDate && content.value.publishDate > Date.now()) ||
        (content.value.expiryDate && content.value.expiryDate < Date.now())
    );
});

watch(
    content,
    async () => {
        if (!content.value) return;

        document.title = isExpiredOrScheduled.value
            ? `Page not found - ${appName}`
            : `${content.value.title} - ${appName}`;

        if (isExpiredOrScheduled.value) return;

        const tagIds = content.value.parentTags.concat([content.value.parentId]); // Include this content's parent ID to include content tagged with the parent (if the parent is a tag document).

        // Fetch tags associated with the content
        tagsContent.value = await db.whereParent(tagIds, DocType.Tag, content.value.language);

        const categoryTagsContent = tagsContent.value.filter(
            (t) => t.parentTagType == TagType.Category,
        );

        selectedTagId.value = categoryTagsContent[0]?.parentId;

        tags.value = (await db.docs.bulkGet(tagIds)) as TagDto[];
    },
    { immediate: true },
);

watch(
    appLanguageAsRef,
    async () => {
        if (!content.value) return;

        if (appLanguageAsRef.value?._id != content.value.language) {
            const contentDocs = await db.whereParent(content.value.parentId);
            const preferred = contentDocs.find((c) => c.language == appLanguageAsRef.value?._id);

            if (preferred) {
                content.value = preferred;
                await router.replace({ name: "content", params: { slug: preferred.slug } });
                return;
            }
            useNotificationStore().addNotification({
                title: "Translation not found",
                description: `There is no ${appLanguageAsRef.value?.name} translation for this content.`,
                state: "error",
                type: "toast",
            });
        }
    },
    { immediate: true },
);

const isLoading = computed(() => content.value === undefined);

const text = computed(() => {
    if (!content.value.text) {
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

// Function to fetch content based on tags
async function contentForTagsCategories() {
    const categoryTags = tags.value
        .filter((t) => t && t.tagType && t.tagType == TagType.Category)
        .map((t) => t._id);
    const contentPromises = categoryTags.map((tagId) =>
        db.contentWhereTag(tagId, { languageId: appLanguageIdAsRef.value }),
    );

    const contentDocs = (await Promise.all(contentPromises)).flat();

    hasContent.value = contentDocs.length > 1 ? true : false;
}

// Watch for changes in tags and refetch content
watch(tags, contentForTagsCategories, { immediate: true });

// Function to handle tag selection
function selectTag(parentId: Uuid) {
    selectedTagId.value = parentId; // Ensure the correct tag is selected
}
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

    <div v-if="isLoading">
        <LoadingSpinner />
    </div>

    <NotFoundPage v-else-if="isExpiredOrScheduled" />
    <div v-else class="mb-8 flex flex-col justify-center lg:flex-row lg:space-x-8">
        <article class="mb-12 w-full lg:w-3/4 lg:max-w-3xl">
            <VideoPlayer v-if="content.video" :content="content" />
            <LImage v-else :image="content.parentImageData" aspectRatio="video" size="post" />

            <h1 class="text-bold mt-4 text-center text-2xl text-zinc-800 dark:text-slate-50">
                {{ content.title }}
            </h1>

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

        <div v-if="hasContent" class="h-full w-full py-2 lg:mt-0 lg:w-1/4 lg:max-w-3xl">
            <div
                class="mb-2 flex flex-wrap border-b border-gray-200 text-center text-sm font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"
            >
                <span
                    v-for="tag in tagsContent.filter(
                        (t: ContentDto) => t.parentTagType == TagType.Category,
                    )"
                    :key="tag._id"
                    @click="selectTag(tag.parentId)"
                    class="me-2 flex cursor-pointer items-center justify-center rounded-t px-2 py-1 text-sm hover:bg-yellow-200 dark:hover:bg-yellow-100/25"
                    :class="{
                        ' bg-yellow-100 text-black shadow dark:bg-yellow-100/10 dark:text-white':
                            selectedTagId == tag.parentId,
                    }"
                >
                    {{ tag.title }}
                </span>
            </div>
            <VerticalTagViewer
                v-for="tag in tags.filter(
                    (t) => t.tagType == TagType.Category && t._id == selectedTagId,
                )"
                :key="tag._id"
                :tag="tag"
                :queryOptions="{
                    filterOptions: { docType: DocType.Post },
                    sortOptions: { sortBy: 'publishDate', sortOrder: 'desc' },
                    languageId: appLanguageIdAsRef,
                }"
            />
        </div>
    </div>

    <RelatedContent
        v-if="content && tags.length"
        :currentContent="content"
        :tags="tags.filter((t) => t && t.tagType && t.tagType == TagType.Topic)"
    />
</template>
