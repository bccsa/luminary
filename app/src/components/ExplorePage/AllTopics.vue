<script setup lang="ts">
import { computed, ref } from "vue";
import { type ContentDto, DocType, TagType, type Uuid, db } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { useDexieLiveQueryWithDeps } from "luminary-shared";
import { RouterLink } from "vue-router";
import { MagnifyingGlassIcon } from "@heroicons/vue/24/solid";
import { isPublished } from "@/util/isPublished";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// Reactive data for topics and categories
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

const tagContent = useDexieLiveQueryWithDeps(
    appLanguageIdsAsRef,
    (appLanguageId: Uuid) =>
        db.docs
            .where({
                type: DocType.Content,
                language: appLanguageId,
                status: "published",
                parentTagType: TagType.Category,
            })
            .filter((c) => {
                const content = c as ContentDto;

                // Filter logic for valid, published categories
                return isPublished(content);
            })
            .toArray() as unknown as Promise<ContentDto[]>,
    {
        initialValue: await db.getQueryCache<ContentDto[]>("explorepage_categories"),
    },
);

// Reactive search term
const searchTerm = ref("");

// View mode: true for grid view, false for list view
const isGridView = ref(false);

// Computed property for filtered topics
const filteredTopics = computed(() => {
    if (!searchTerm.value.trim()) {
        return allTopics.value;
    }

    return allTopics.value.filter((t) =>
        t.title.toLowerCase().includes(searchTerm.value.toLowerCase()),
    );
});
</script>

<template>
    <div v-if="allTopics.length > 0 && tagContent.length > 0" class="lg:mx-32">
        <!-- Search Bar -->
        <div class="mb-4 mt-6 flex">
            <div class="relative w-3/4" v-if="allTopics.length > 0">
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

            <!-- Toggle Button -->
            <button class="flex w-1/4 items-center justify-end" @click="isGridView = !isGridView">
                <component :is="isGridView ? ListBulletIcon : Squares2X2Icon" class="h-6 w-6" />
            </button>
        </div>

        <!-- No Results -->
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
                </RouterLink>
            </div>
        </div>
    </div>
</template>

<stype scoped>

</stype>
