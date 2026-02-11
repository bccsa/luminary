<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import { appLanguageIdsAsRef } from "@/globalConfig";
import {
    db,
    TagType,
    useDexieLiveQueryWithDeps,
    mangoToDexie,
    type ContentDto,
    type Uuid,
} from "luminary-shared";
import { computed, toRef } from "vue";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "./HorizontalContentTileCollection.vue";
import { mangoIsPublished } from "@/util/mangoIsPublished";
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

const contentDocs = useDexieLiveQueryWithDeps(
    [appLanguageIdsAsRef, contentIds],
    ([languageIds, ids]: [Uuid[], Uuid[]]) => {
        if (ids.length === 0) return Promise.resolve([] as ContentDto[]);
        return mangoToDexie<ContentDto>(db.docs, {
            selector: {
                $and: [
                    { parentId: { $in: ids } },
                    ...mangoIsPublished(languageIds),
                ],
            },
            $sort: [{ publishDate: "asc" }],
        });
    },
    { initialValue: [] as ContentDto[] },
);

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
            <div class="max-w-full" ref="scrollElement">
                <HorizontalContentTileCollection
                    v-for="topic in contentByTopic.tagged.value"
                    :key="topic.tag._id"
                    :contentDocs="topic.content"
                    :title="topic.tag.title"
                    :summary="topic.tag.summary"
                    :showPublishDate="false"
                />
            </div>
        </div>
    </IgnorePagePadding>
</template>
