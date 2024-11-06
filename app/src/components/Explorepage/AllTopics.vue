<script setup lang="ts">
import { ref, watch } from "vue";
import { type ContentDto, DocType, TagType, type Uuid, db } from "luminary-shared";
import { appLanguageIdAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import LImage from "../images/LImage.vue";
import ContentTile from "../content/ContentTile.vue";
import { RouterLink } from "vue-router";
import { ListBulletIcon, Squares2X2Icon } from "@heroicons/vue/24/solid";

const allTopics = useDexieLiveQueryWithDeps(
    appLanguageIdAsRef,
    (appLanguageId: Uuid) =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageId,
                status: "published",
                parentTagType: TagType.Topic,
            })
            .filter((c) => {
                const content = c as ContentDto;
                if (content.type !== DocType.Content) return false;
                if (content.language !== appLanguageId) return false;

                // Only include published content
                if (content.status !== "published") return false;
                if (!content.publishDate) return false;
                if (content.publishDate > Date.now()) return false;
                if (content.expiryDate && content.expiryDate < Date.now()) return false;
                return true;
            })

            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("homepage_newestContent"),
    },
);

watch(allTopics, async (value) => {
    db.setQueryCache<ContentDto[]>("homepage_newestContent", value.value);
});

// View mode switcher: 'matrix' or 'list'
const viewMode = ref<"matrix" | "list">("matrix");

// Function to toggle between matrix and list views
const toggleViewMode = () => {
    viewMode.value = viewMode.value === "matrix" ? "list" : "matrix";
};
</script>

<template>
    <div v-if="allTopics">
        <div class="mb-4 mt-12 flex justify-between">
            <input
                name="input"
                type="text"
                placeholder="Search topic..."
                class="w-2/3 rounded-md border border-zinc-300 bg-inherit p-2"
            />

            <div
                class="flex cursor-pointer items-center justify-center gap-1"
                @click="toggleViewMode"
            >
                <component
                    :is="viewMode === 'matrix' ? ListBulletIcon : Squares2X2Icon"
                    class="h-8 w-8"
                />
                <p class="text-xl">{{ viewMode === "matrix" ? "List" : "Matrix" }}</p>
            </div>
        </div>

        <div v-if="viewMode === 'matrix'" class="flex flex-wrap gap-4">
            <ContentTile
                v-for="content in allTopics.value"
                :key="content._id"
                :content="content"
                :show-publish-date="false"
            />
        </div>

        <div v-else class="space-y-4">
            <div v-for="content in allTopics.value" :key="content._id">
                <RouterLink
                    :to="{ name: 'content', params: { slug: content.slug } }"
                    class="flex rounded shadow-md hover:bg-yellow-500/5"
                >
                    <LImage :image="content.parentImageData" aspectRatio="video" size="thumbnail" />
                    <div class="p-2">
                        <h3 class="text-lg font-semibold">{{ content.title }}</h3>
                        <p class="text-gray-600">{{ content.summary }}</p>
                    </div>
                </RouterLink>
            </div>
        </div>
    </div>
</template>
