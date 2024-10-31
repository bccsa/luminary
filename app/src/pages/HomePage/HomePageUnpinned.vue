<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { type ContentDto, DocType, db, type Uuid } from "luminary-shared";
import { appLanguageIdAsRef } from "@/globalConfig";
import HomePageUnpinnedContent from "./HomePageUnpinnedContent.vue";
import _ from "lodash";

const newest100Content = db.toRef<ContentDto[]>(
    () =>
        db.docs
            .orderBy("publishDate")
            .reverse()
            .filter((c) => {
                const content = c as ContentDto;
                if (content.type !== DocType.Content) return false;
                if (content.language !== appLanguageIdAsRef.value) return false;

                // Only include published content
                if (content.status !== "published") return false;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })
            .limit(100) // Limit to the newest posts
            .toArray() as unknown as Promise<ContentDto[]>,
    await db.getQueryCache<ContentDto[]>("homepage_newest100Content"),
);

watch(newest100Content, async (value) => {
    await db.setQueryCache<ContentDto[]>("homepage_newest100Content", value);
});

const categoryIds = computed(() =>
    newest100Content.value
        .map((content) => content.parentTags)
        .flat()
        .filter((value, index, array) => {
            return array.indexOf(value) === index;
        }),
);

// Refresh the component when the categoryIds change
let categoryIds_prev: Uuid[];
const refreshKey = ref(0);
watch(categoryIds, async (value) => {
    value.sort();
    if (!categoryIds_prev) {
        categoryIds_prev = value;
        refreshKey.value++;
        console.log("a", refreshKey.value);
        return;
    }

    if (!_.isEqual(value, categoryIds_prev)) {
        categoryIds_prev = value;
        refreshKey.value++;
        console.log("b", refreshKey.value);
    }
});
</script>

<template>
    <HomePageUnpinnedContent
        :newestContent="newest100Content"
        :categoryIds="categoryIds"
        v-if="newest100Content.length"
        :key="refreshKey"
    />
</template>
