<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
import { appLanguageIdAsRef } from "@/globalConfig";
import { DocType, TagType, type TagDto, type Uuid } from "luminary-shared";
import { computed, toRefs } from "vue";

type Props = {
    tags: TagDto[];
    currentContentId: Uuid;
};
const props = defineProps<Props>();

const { tags } = toRefs(props);

const topicTags = computed(() => tags.value.filter((c: TagDto) => c.tagType === TagType.Topic));
</script>

<template>
    <IgnorePagePadding class="bg-zinc-100 pb-1 pt-3 dark:bg-zinc-900">
        <div v-if="topicTags.length">
            <h1 class="px-3 pb-5 text-lg text-zinc-600 dark:text-zinc-200">Related Content</h1>
            <div v-if="topicTags.length">
                <div class="flex max-w-full flex-wrap">
                    <div class="max-w-full">
                        <HorizontalScrollableTagViewer
                            v-for="tag in topicTags"
                            :key="tag._id"
                            :tag="tag"
                            :currentPostId="currentContentId"
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
