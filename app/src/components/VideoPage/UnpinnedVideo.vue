<script setup lang="ts">
import { computed, watch } from "vue";
import {
    type ContentDto,
    DocType,
    db,
    type Uuid,
    useDexieLiveQueryWithDeps,
    TagType,
    PostType,
} from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { contentByTag } from "../contentByTag";
import { isPublished } from "@/util/isPublished";
import IgnorePagePadding from "../IgnorePagePadding.vue";

const unpinnedContent = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageId) =>
        db.docs
            .orderBy("publishDate")
            .reverse()
            .filter((c) => {
                const content = c as ContentDto;
                if (content.type !== DocType.Content) return false;
                if (content.parentPostType && content.parentPostType == PostType.Page) return false;
                if (content.parentTagType && content.parentTagType !== TagType.Topic) return false;
                if (content.language !== appLanguageId) return false;
                if (!content.video) return false;

                // Only include published content
                return isPublished(content, [appLanguageId]);
            })
            .limit(50)
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("videopage_unpinnedContent") },
);

watch(unpinnedContent, async (value) => {
    db.setQueryCache<ContentDto[]>("videopage_unpinnedContent", value);
});

const categoryIds = computed(() =>
    unpinnedContent.value
        .map((content) => content.parentTags)
        .flat()
        .filter((value, index, array) => {
            return array.indexOf(value) === index;
        }),
);

const categories = useDexieLiveQueryWithDeps(
    [categoryIds, appLanguageIdsAsRef],
    ([_categoryIds, appLanguageId]: [Uuid[], Uuid]) =>
        db.docs
            .where("parentId")
            .anyOf(_categoryIds)
            .filter((content) => {
                const _content = content as ContentDto;
                if (_content.parentType !== DocType.Tag) return false;
                if (!_content.parentTagType) return false;
                if (_content.parentPinned) return false;

                // Use the `isPublished` helper function
                return (
                    isPublished(_content, [appLanguageId]) &&
                    _content.parentTagType === TagType.Category &&
                    _content.language === appLanguageId
                );
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("videopage_unpinnedCategories") },
);

watch(
    () => categories.value,
    (value) => {
        db.setQueryCache<ContentDto[]>("videopage_unpinnedCategories", value);
    },
);

const unpinnedNewestContentByCategory = contentByTag(unpinnedContent, categories);
</script>

<template>
    <IgnorePagePadding>
        <HorizontalContentTileCollection
            v-for="c in unpinnedNewestContentByCategory"
            :key="c.tag._id"
            :contentDocs="c.content"
            :title="c.tag.title"
            :summary="c.tag.summary"
            class="pt-2"
        />
    </IgnorePagePadding>
</template>
