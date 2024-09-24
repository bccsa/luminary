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
const content = ref<ContentDto[]>([]);

// Function to fetch content based on tags
async function fetchContentForTags() {
    const tagIds = tags.value.map((t: TagDto) => t._id);
    const contentPromises = tagIds.map((tagId) =>
        db.contentWhereTag(tagId, { languageId: appLanguageIdAsRef.value }),
    );

    content.value = (await Promise.all(contentPromises)).flat();
    console.log(content.value);
}

// Watch for changes in tags and refetch content
watch(tags, fetchContentForTags, { immediate: true });
</script>

<template>
    <IgnorePagePadding v-if="content.length > 0" class="bg-zinc-100 pb-1 pt-3 dark:bg-zinc-900">
        <div>
            <div>
                <h1 class="px-6 pb-5 text-lg text-zinc-600 dark:text-zinc-200">Related</h1>

                <div class="flex max-w-full flex-wrap">
                    <div class="max-w-full">
                        <HorizontalScrollableTagViewer
                            v-for="tag in tags"
                            :key="tag._id"
                            :tag="tag"
                            :currentContentId="currentContentId"
                            :queryOptions="{
                                filterOptions: { docType: DocType.Post },
                                languageId: appLanguageIdAsRef,
                            }"
                            class="mb-5 max-w-full"
                        />
                    </div>
                </div>
            </div>
        </div>
    </IgnorePagePadding>
</template>
