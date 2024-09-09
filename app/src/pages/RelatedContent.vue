<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
import { appLanguageIdAsRef } from "@/globalConfig";
import { db, DocType, TagType, type TagDto, type Uuid } from "luminary-shared";
import { ref, watchEffect } from "vue";

type Props = {
    tagIds: Uuid[];
};
const props = defineProps<Props>();

const topicTags = ref<TagDto[]>([]);

const tags = db.toRef<TagDto[]>(
    () => db.docs.bulkGet(props.tagIds) as unknown as Promise<TagDto[]>,
);

watchEffect(async () => {
    if (!tags.value) return;

    topicTags.value = tags.value.filter((c: TagDto) => c.tagType === TagType.Topic);
});
</script>

<template>
    <!-- display vertical -->
    <IgnorePagePadding>
        <div class="bg-zinc-100 px-6 pb-1 pt-3 dark:bg-zinc-900" v-if="topicTags.length">
            <h1 v-if="topicTags.length" class="pb-5 text-lg text-zinc-600 dark:text-zinc-200">
                Related Content
            </h1>
            <div class="flex max-w-full flex-wrap">
                <div class="max-w-full">
                    <HorizontalScrollableTagViewer
                        v-for="tag in topicTags"
                        :key="tag._id"
                        :tag="tag"
                        :queryOptions="{
                            filterOptions: { docType: DocType.Post },
                            languageId: appLanguageIdAsRef,
                        }"
                        class="mb-5 max-w-full"
                    />
                </div>
            </div>
        </div>
    </IgnorePagePadding>
</template>
