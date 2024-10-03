<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
import { appLanguageIdAsRef } from "@/globalConfig";
import { db, DocType, type ContentDto, type TagDto, type Uuid } from "luminary-shared";
import { ref, toRefs, watch } from "vue";

type Props = {
    tags: TagDto[];
    title?: string;
    currentContentId: Uuid;
};
const props = defineProps<Props>();

const { tags } = toRefs(props);
const contentForTag = ref<Record<string, ContentDto[]>>({}); // Store content for each tag

// Function to fetch content based on tags
async function fetchContentForTags() {
    const tagContent = await Promise.all(
        tags.value.map(async (tag: TagDto) => {
            const content = await db.contentWhereTag(tag._id, {
                languageId: appLanguageIdAsRef.value,
            });
            return {
                tagId: tag._id,
                content: content.filter((item) => item._id !== props.currentContentId), // Filter out current content
            };
        }),
    );

    // Create a mapping of tagId to content array
    contentForTag.value = tagContent.reduce(
        (acc, { tagId, content }) => {
            acc[tagId] = content;
            return acc;
        },
        {} as Record<string, ContentDto[]>,
    );
}

// Watch for changes in tags and refetch content
watch(tags, fetchContentForTags, { immediate: true });
</script>

<template>
    <IgnorePagePadding
        v-if="Object.keys(contentForTag).length > 0"
        class="bg-yellow-500/5 pb-1 pt-3"
    >
        <div>
            <h1 class="px-6 pb-5 text-lg text-zinc-600 dark:text-zinc-200">Related</h1>
            <div class="flex max-w-full flex-wrap">
                <div class="max-w-full">
                    <template v-for="tag in tags" :key="tag._id">
                        <!-- Only show if content exists for the tag and the content length is greater than 0 -->
                        <HorizontalScrollableTagViewer
                            v-if="contentForTag[tag._id] && contentForTag[tag._id].length > 0"
                            :tag="tag"
                            :currentContentId="currentContentId"
                            :queryOptions="{
                                filterOptions: { docType: DocType.Post },
                                languageId: appLanguageIdAsRef,
                            }"
                            class="mb-5 max-w-full"
                        />
                    </template>
                </div>
            </div>
        </div>
    </IgnorePagePadding>
</template>
