<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { toRef, watch } from "vue";
import { type ContentDto, DocType, TagType, type Uuid, db } from "luminary-shared";
import { appLanguageIdAsRef } from "@/globalConfig";
import { contentByCategory } from "./contentByCategory";

type Props = {
    newestContent: ContentDto[];
    categoryIds: Uuid[];
};
const props = defineProps<Props>();

const categories = db.toRef<ContentDto[]>(
    () =>
        db.docs
            .where("parentId")
            .anyOf(props.categoryIds)
            .filter((content) => {
                const _content = content as ContentDto;
                if (_content.parentType !== DocType.Tag) return false;
                if (!_content.parentTagType) return false;
                if (!_content.publishDate) return false;
                if (_content.status !== "published") return false;
                if (_content.publishDate > Date.now()) return false;
                if (_content.expiryDate && _content.expiryDate < Date.now()) return false;
                if (_content.parentPinned) return false;
                return (
                    _content.parentTagType == TagType.Category &&
                    _content.language === appLanguageIdAsRef.value
                );
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    await db.getQueryCache<ContentDto[]>("homepage_unpinnedCategories"),
);

watch(
    () => categories.value,
    async (value) => {
        db.setQueryCache<ContentDto[]>("homepage_unpinnedCategories", value);
    },
);

const unpinnedNewestContentByCategory = contentByCategory(
    toRef(() => props.newestContent),
    categories,
);
</script>

<template>
    <HorizontalContentTileCollection
        v-for="c in unpinnedNewestContentByCategory"
        :key="c.category._id"
        :contentDocs="c.content"
        :title="c.category.title"
        :summary="c.category.summary"
        class="pt-4"
    />
</template>
