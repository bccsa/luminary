<script setup lang="ts">
import { RouterLink } from "vue-router";
import BasePage from "@/components/BasePage.vue";
import EmptyState from "@/components/EmptyState.vue";
import LButton from "@/components/button/LButton.vue";
import { PlusIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import { usePostStore } from "@/stores/post";
import LCard from "@/components/common/LCard.vue";
import LTable from "@/components/common/LTable.vue";
import { computed, ref } from "vue";
import { ContentStatus, type Content, type Post } from "@/types";
import { useLanguageStore } from "@/stores/language";
import LBadge from "@/components/common/LBadge.vue";
import { storeToRefs } from "pinia";
import { useLocalChangeStore } from "@/stores/localChanges";

const { posts } = storeToRefs(usePostStore());
const { languages } = storeToRefs(useLanguageStore());
const { isLocalChange } = useLocalChangeStore();

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
        text: "",
        key: "offlineChanges",
        sortable: false,
    },
    {
        text: "Translations",
        key: "translations",
        sortable: false,
    },
    {
        text: "Last updated",
        key: "updatedTime",
        sortable: false,
    },
    {
        text: "",
        key: "actions",
        sortable: false,
    },
];

const translationStatus = computed(() => {
    return (content: Content | undefined) => {
        if (content?.status == ContentStatus.Published) {
            return "success";
        }

        if (content?.status == ContentStatus.Draft) {
            return "info";
        }

        return "default";
    };
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
});
const formatDate = computed(() => {
    return (date: Date) => dateFormatter.format(date);
});
</script>

<template>
    <BasePage title="Posts" :loading="posts === undefined">
        <template #actions>
            <LButton
                v-if="posts && posts.length > 0"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'posts.create' }"
            >
                Create post
            </LButton>
        </template>

        <EmptyState
            v-if="!posts || posts.length == 0"
            title="No posts yet"
            description="Get started by creating a new post."
            buttonText="Create post"
            :buttonLink="{ name: 'posts.create' }"
        />

        <LCard v-else padding="none">
            <LTable
                :columns="columns"
                :items="posts"
                v-model:sortBy="sortBy"
                v-model:sortDirection="sortDirection"
            >
                <template #item.title="{ content }">
                    {{ content.length > 0 ? content[0].title : "No translation" }}
                </template>
                <template #item.offlineChanges="post">
                    <LBadge v-if="isLocalChange(post._id)" variant="warning">
                        Offline changes
                    </LBadge>
                </template>
                <template #item.translations="{ content }">
                    <div class="flex gap-2" v-if="content.length > 0">
                        <LBadge
                            v-for="language in languages"
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
                        </LBadge>
                    </div>
                </template>
                <template #item.updatedTime="post">
                    {{ formatDate(post.updatedTimeUtc) }}
                </template>
                <template #item.actions="post">
                    <LButton
                        variant="tertiary"
                        :icon="PencilSquareIcon"
                        :is="RouterLink"
                        :to="{
                            name: 'posts.edit',
                            params: {
                                id: post._id,
                            },
                        }"
                    ></LButton>
                </template>
            </LTable>
        </LCard>
    </BasePage>
</template>
