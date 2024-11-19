<script setup lang="ts">
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import { appLanguageIdAsRef } from "@/globalConfig";
import {
    db,
    TagType,
    useDexieLiveQueryWithDeps,
    type ContentDto,
    type Uuid,
} from "luminary-shared";
import { computed, ref, toRef } from "vue";
import { contentByTag } from "../contentByTag";
import HorizontalContentTileCollection from "./HorizontalContentTileCollection.vue";
import { useInfiniteScroll } from "@vueuse/core";

type Props = {
    tags: ContentDto[];
    selectedContent: ContentDto;
};
const props = defineProps<Props>();

const isNotTopic = computed(() => props.selectedContent.parentTagType !== TagType.Topic);
const contentIds = computed(() =>
    props.tags
        .map((tag) => tag.parentTaggedDocs)
        .flat()
        .filter((e, i, self) => i === self.indexOf(e)),
);

const contentDocs = useDexieLiveQueryWithDeps(
    [appLanguageIdAsRef, contentIds],
    ([languageId, ids]: [Uuid, Uuid[]]) =>
        db.docs
            .where("parentId")
            .anyOf(ids)
            .filter((c) => {
                const content = c as ContentDto;
                if (content.language !== languageId) return false;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .sortBy("publishDate") as unknown as Promise<ContentDto[]>,
    { initialValue: [] as ContentDto[] },
);

const filtered = computed(() =>
    contentDocs.value.filter((item) => item._id !== props.selectedContent._id),
);

const contentByTopic = contentByTag(filtered, toRef(props.tags));
const infiniteScrollData = ref(contentByTopic.value.slice(0, 5));
const scrollElement = ref<HTMLElement | undefined>(undefined);
useInfiniteScroll(
    scrollElement,
    () => {
        infiniteScrollData.value.push(
            ...contentByTopic.value.slice(
                infiniteScrollData.value.length,
                infiniteScrollData.value.length + 5,
            ),
        );
    },
    { distance: 10 },
);
</script>

<template>
    <IgnorePagePadding>
        <h1 v-if="isNotTopic" class="px-6 text-xl text-zinc-800 dark:text-zinc-200">Related</h1>
        <div class="mb-2 flex max-w-full flex-wrap">
            <div class="max-w-full" ref="scrollElement">
                <HorizontalContentTileCollection
                    v-for="topic in infiniteScrollData"
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
