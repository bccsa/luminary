<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { type ContentDto, DocType, TagType, type Uuid, db } from "luminary-shared";
import { appLanguageIdAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import LImage from "../images/LImage.vue";
import { RouterLink } from "vue-router";
import { MagnifyingGlassIcon } from "@heroicons/vue/24/solid";
import { isPublished } from "@/util/isPublished";
import { useInfiniteScroll } from "@vueuse/core";

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
                return isPublished(content);
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
watch(searchTerm, () => {
    scrollPosition.value = 10; // Reset infinite scroll on search change
});

// Computed property for filtered topics
const filteredTopics = computed(() => {
    if (!searchTerm.value.trim()) return allTopics.value;
    return allTopics.value.filter((t) =>
        t.title.toLowerCase().includes(searchTerm.value.toLowerCase()),
    );
});

// Infinite scroll setup
const scrollElement = ref<HTMLElement | null>(null);
const scrollPosition = ref(10);
const infiniteScrollData = computed(() => filteredTopics.value.slice(0, scrollPosition.value));

useInfiniteScroll(
    scrollElement,
    () => {
        if (scrollPosition.value < filteredTopics.value.length) {
            scrollPosition.value += 10;
        }
    },
    { distance: 10 },
);
</script>
<template>
    <div v-if="allTopics" ref="scrollElement" class="lg:mx-32">
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

        <div
            v-if="filteredTopics.length === 0 && searchTerm.trim()"
            class="text-center text-gray-500"
        >
            No results found for "{{ searchTerm }}"
        </div>

        <div class="space-y-2">
            <div
                v-for="content in infiniteScrollData"
                :key="content._id"
                class="flex overflow-clip rounded-lg bg-zinc-50 pl-2 shadow-sm hover:bg-yellow-500/10 dark:bg-slate-800 dark:hover:bg-yellow-500/10 md:pl-4"
            >
                <RouterLink
                    :to="{ name: 'content', params: { slug: content.slug } }"
                    class="flex w-full justify-between"
                >
                    <div class="my-auto flex flex-col gap-y-1 text-zinc-800 dark:text-slate-50">
                        <h3 class="text-sm">{{ content.title }}</h3>
                        <p
                            v-if="content.summary"
                            class="line-clamp-1 text-xs text-zinc-500 dark:text-slate-300"
                        >
                            {{ content.summary }}
                        </p>
                    </div>
                    <LImage
                        :image="content.parentImageData"
                        aspectRatio="classic"
                        size="small"
                        class="flex items-center"
                        :rounded="false"
                    />
                </RouterLink>
            </div>
        </div>
    </div>
</template>
