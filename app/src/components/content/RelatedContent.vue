<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import { TagType, type ContentDto } from "luminary-shared";
import { computed, toRef } from "vue";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "./HorizontalContentTileCollection.vue";
import { useContentQuery } from "@/composables/useContentQuery";
import { useI18n } from "vue-i18n";

type Props = {
    tags: ContentDto[];
    selectedContent: ContentDto;
};
const props = defineProps<Props>();

const { t } = useI18n();

const isNotTopic = computed(() => props.selectedContent.parentTagType !== TagType.Topic);
const contentIds = computed(() =>
    props.tags
        .map((tag) => tag.parentTaggedDocs)
        .flat()
        .filter((e, i, self) => i === self.indexOf(e)),
);

// parentId $in can't use a sorted Mango index, so the API supplement scans the older
// tail. Cap at 50 so the limit-shortfall branch skips the API POST once local Dexie
// already holds 50 matches (the common warm case); 50 also comfortably covers what the
// horizontal related-content row displays.
const contentDocs = useContentQuery(() => [{ parentId: { $in: contentIds.value } }], {
    sort: [{ publishDate: "asc" }],
    limit: 50,
});

const filtered = computed(() =>
    contentDocs.value.filter((item) => item._id !== props.selectedContent._id),
);

const contentByTopic = contentByTag(filtered, toRef(props.tags));
</script>

<template>
    <IgnorePagePadding>
        <h1
            v-if="isNotTopic && contentByTopic.tagged.value.length"
            class="px-4 pb-3 text-xl text-zinc-800 dark:text-zinc-200"
        >
            {{ t("content.related_title") }}
        </h1>
        <div class="mb-2 flex max-w-full flex-wrap">
            <div
                class="max-w-full"
                ref="scrollElement"
            >
                <HorizontalContentTileCollection
                    v-for="topic in contentByTopic.tagged.value"
                    :key="topic.tag._id"
                    :contentDocs="topic.content"
                    :title="topic.tag.title"
                    :summary="topic.tag.summary"
                    :useVerticalTileLayout="topic.tag.parentUseVerticalTileLayout"
                    :showPublishDate="false"
                />
            </div>
        </div>
    </IgnorePagePadding>
</template>
