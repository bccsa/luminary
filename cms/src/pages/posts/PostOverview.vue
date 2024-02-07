<script setup lang="ts">
import { RouterLink } from "vue-router";
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import AcButton from "@/components/button/AcButton.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { usePostStore } from "@/stores/post";
import AcCard from "@/components/common/AcCard.vue";
import AcTable from "@/components/common/AcTable.vue";
import { ref } from "vue";
import { ContentStatus, type Content, type Post } from "@/types";
import { useLanguageStore } from "@/stores/language";
import AcBadge from "@/components/common/AcBadge.vue";

const postStore = usePostStore();
const languageStore = useLanguageStore();

const sortBy = ref(undefined);
const sortDirection = ref(undefined);
const columns = [
    {
        text: "Title",
        key: "title",
        sortMethod: (a: Post, b: Post) => {
            const firstItem = a.content[0].title;
            const secondItem = b.content[0].title;
            if (firstItem < secondItem) return sortDirection.value == "descending" ? 1 : -1;
            if (firstItem > secondItem) return sortDirection.value == "descending" ? -1 : 1;
            return 0;
        },
    },
    {
        text: "Translations",
        key: "translations",
        sortable: false,
    },
    {
        text: "Last updated",
        key: "updatedTimeUtc",
    },
];

const translationStatus = (content: Content | undefined) => {
    if (content?.status == ContentStatus.Published) {
        return "success";
    }

    if (content?.status == ContentStatus.Draft) {
        return "info";
    }

    return "default";
};
</script>

<template>
    <BasePage title="Posts" :loading="postStore.posts === undefined">
        <template #actions>
            <AcButton
                v-if="postStore.posts && postStore.posts.length > 0"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'posts.create' }"
            >
                Create Post
            </AcButton>
        </template>

        <EmptyState
            v-if="!postStore.posts || postStore.posts.length == 0"
            title="No posts yet"
            description="Get started by creating a new post."
            buttonText="Create Post"
            :buttonLink="{ name: 'posts.create' }"
        />

        <AcCard v-else padding="none">
            <AcTable
                :columns="columns"
                :items="postStore.posts"
                v-model:sortBy="sortBy"
                v-model:sortDirection="sortDirection"
            >
                <template #item.title="{ content }">
                    {{ content[0].title }}
                </template>
                <template #item.translations="{ content }">
                    <div class="flex gap-2">
                        <AcBadge
                            v-for="language in languageStore.languages"
                            :key="language.languageCode"
                            type="language"
                            :variant="
                                translationStatus(
                                    content.find(
                                        (c: Content) =>
                                            c.language.languageCode == language.languageCode,
                                    ),
                                )
                            "
                        >
                            {{ language.languageCode }}
                        </AcBadge>
                    </div>
                </template>
            </AcTable>
        </AcCard>
    </BasePage>
</template>
