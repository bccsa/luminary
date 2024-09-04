<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
import { appLanguageIdAsRef } from "@/globalConfig";
import { db, DocType, TagType, type TagDto, type Uuid } from "luminary-shared";
import { ref, watch } from "vue";
import VerticalTagViewer from "@/components/tags/VerticalTagViewer.vue";

type Props = {
    tagIds: Uuid[];
};
const props = defineProps<Props>();

const categoryTags = ref<TagDto[]>([]);
const topicTags = ref<TagDto[]>([]);

const tags = db.toRef<TagDto[]>(
    () => db.docs.bulkGet(props.tagIds) as unknown as Promise<TagDto[]>,
);

watch(tags, () => {
    categoryTags.value = tags.value.filter((c: TagDto) => c.tagType === TagType.Category);
    topicTags.value = tags.value.filter((c: TagDto) => c.tagType === TagType.Topic);
});
</script>

<template>
    <!-- display vertical -->
    <VerticalTagViewer
        v-for="tag in categoryTags"
        :key="tag._id"
        :tag="tag"
        :queryOptions="{
            filterOptions: { limit: 10, docType: DocType.Post },
            languageId: appLanguageIdAsRef,
        }"
        class="mx-auto mb-8 max-w-3xl"
    />
    <h1 v-if="topicTags.length" class="text-lg text-zinc-600 dark:text-zinc-200">
        Related Content
    </h1>
    <IgnorePagePadding>
        <div class="flex max-w-full flex-wrap">
            <!-- <div class="max-w-full"> -->
            <HorizontalScrollableTagViewer
                v-for="tag in topicTags"
                :key="tag._id"
                :tag="tag"
                :queryOptions="{
                    filterOptions: { limit: 10, docType: DocType.Post },
                    languageId: appLanguageIdAsRef,
                }"
                class="mb-5 max-w-full"
            />
            <!-- </div> -->
        </div>
    </IgnorePagePadding>
</template>
