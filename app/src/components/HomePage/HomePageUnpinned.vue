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
import { appLanguageIdAsRef } from "@/globalConfig";
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { contentByTag } from "../contentByTag";
import { isPublished } from "@/util/isPublished";

const newest100Content = useDexieLiveQueryWithDeps(
    appLanguageIdAsRef,
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

                // Only include published content
                if (content.status !== "published") return false;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .limit(100) // Limit to the newest posts
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("homepage_newest100Content") },
);

watch(newest100Content, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_newest100Content", value);
});

const categoryIds = computed(() =>
    newest100Content.value
        .map((content) => content.parentTags)
        .flat()
        .filter((value, index, array) => {
            return array.indexOf(value) === index;
        }),
);

const categories = useDexieLiveQueryWithDeps(
    [categoryIds, appLanguageIdAsRef],
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
                    isPublished(_content) &&
                    _content.parentTagType === TagType.Category &&
                    _content.language === appLanguageId
                );
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    { initialValue: await db.getQueryCache<ContentDto[]>("homepage_unpinnedCategories") },
);

watch(
    () => categories.value,
    (value) => {
        db.setQueryCache<ContentDto[]>("homepage_unpinnedCategories", value);
    },
);

const unpinnedNewestContentByCategory = contentByTag(newest100Content, categories);
</script>

<template>
    <HorizontalContentTileCollection
        v-for="c in unpinnedNewestContentByCategory"
        :key="c.tag._id"
        :contentDocs="c.content"
        :title="c.tag.title"
        :summary="c.tag.summary"
        class="pt-2"
    />
</template>
