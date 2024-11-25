<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { type ContentDto, DocType, TagType, type Uuid, db } from "luminary-shared";
import { appLanguageIdAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import LImage from "../images/LImage.vue";
import { RouterLink } from "vue-router";
import { MagnifyingGlassIcon } from "@heroicons/vue/24/solid";

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
        initialValue: await db.getQueryCache<ContentDto[]>("explorepage_allTopics"),
    },
);

watch(allTopics, async (value) => {
    db.setQueryCache<ContentDto[]>("explorepage_allTopics", value);
});

// Reactive search term
const searchTerm = ref("");

// Computed property for filtered topics
const filteredTopics = computed(() => {
    if (!searchTerm.value.trim()) {
        // Show all topics when search term is empty
        return allTopics.value;
    }
    // Filter topics based on the search term
    return allTopics.value.filter((t) =>
        t.title.toLowerCase().includes(searchTerm.value.toLowerCase()),
    );
});
</script>

<template>
    <div v-if="allTopics" class="lg:mx-32">
        <div class="mb-4 mt-6">
            <div class="relative">
                <MagnifyingGlassIcon
                    class="absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500"
                />
                <input
                    v-model="searchTerm"
                    name="input"
                    type="text"
                    placeholder="Search..."
                    class="w-full rounded-md border border-zinc-500 bg-inherit py-1 pl-8 pr-2"
                />
            </div>
        </div>

        <!-- Show "No results found" message if filteredTopics is empty and searchTerm is not blank -->
        <div
            v-if="filteredTopics.length === 0 && searchTerm.trim()"
            class="text-center text-gray-500"
        >
            No results found for "{{ searchTerm }}"
        </div>

        <div class="space-y-4">
            <div
                v-for="content in filteredTopics"
                :key="content._id"
                class="flex dark:border-gray-700"
            >
                <RouterLink
                    :to="{ name: 'content', params: { slug: content.slug } }"
                    class="flex w-full justify-between rounded hover:bg-yellow-500/10"
                >
                    <div class="my-auto p-2">
                        <h3 class="">{{ content.title }}</h3>
                        <p v-if="content.summary" class="line-clamp-2 text-sm">
                            {{ content.summary }}
                        </p>
                    </div>
                    <LImage
                        :image="content.parentImageData"
                        aspectRatio="classic"
                        size="small"
                        class="flex items-center"
                    />
                </RouterLink>
            </div>
        </div>
    </div>
</template>
