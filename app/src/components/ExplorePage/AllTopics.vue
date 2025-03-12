<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { type ContentDto, DocType, TagType, type Uuid, db } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import LImage from "../images/LImage.vue";
import { RouterLink } from "vue-router";
import { MagnifyingGlassIcon } from "@heroicons/vue/24/solid";
import { isPublished } from "@/util/isPublished";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const allTopics = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageIds: Uuid[]) =>
        db.docs
            .where({
                type: DocType.Content,
                status: "published",
                parentTagType: TagType.Topic,
            })
            .filter((c) => {
                return isPublished(c as ContentDto, appLanguageIds);
            })

            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("explorepage_allTopics"),
        deep: true,
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
                    :placeholder="t('topic.search_placeholder') + '...'"
                    class="w-full rounded-md border border-zinc-500 bg-inherit py-1 pl-8 pr-2"
                />
            </div>
        </div>

        <!-- Show "No results found" message if filteredTopics is empty and searchTerm is not blank -->
        <div
            v-if="filteredTopics.length === 0 && searchTerm.trim()"
            class="text-center text-gray-500"
        >
            {{ t("topic.no_results_found") }} "{{ searchTerm }}"
        </div>

        <div class="space-y-2">
            <div
                v-for="content in filteredTopics"
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
