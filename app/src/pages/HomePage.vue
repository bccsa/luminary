<script setup lang="ts">
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
// import { useTagStore } from "@/stores/tag";
// import { usePostStore } from "@/stores/post";
import { TagType } from "@/types";
// import { storeToRefs } from "pinia";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { DocType, db } from "luminary-shared";

// const { posts } = storeToRefs(usePostStore());
// const { tagsByTagType } = storeToRefs(useTagStore());
const { isAuthenticated } = useAuth0();

const hasPosts = db.someByTypeAsRef(DocType.Post);
const pinnedCategories = db.whereTagTypeAsRef(TagType.Category, {
    filterOptions: {
        topLevelOnly: true,
        excludeEmpty: true,
        pinned: true,
    },
    sortOptions: {
        sortBy: "publishDate",
        sortOrder: "asc",
    },
});
const unpinnedCategories = db.whereTagTypeAsRef(TagType.Category, {
    filterOptions: {
        topLevelOnly: true,
        excludeEmpty: true,
        pinned: false,
    },
    sortOptions: {
        sortBy: "publishDate",
        sortOrder: "asc",
    },
});
</script>

<template>
    pinned
    <div v-for="t in pinnedCategories" :key="t._id" class="text-lg">
        {{ t._id }}
        <HorizontalScrollableTagViewer :tag="t" />
    </div>
    <br />
    unpined
    <div v-for="t in unpinnedCategories" :key="t._id">
        {{ t._id }}
        <HorizontalScrollableTagViewer :tag="t" :queryOptions="{ languageId: 'language-eng' }" />
    </div>
    <br />

    <div v-if="hasPosts" class="text-zinc-800 dark:text-zinc-100">
        <div v-if="isAuthenticated">
            <p>
                You don't have access to any content. If you believe this is an error, send your
                contact person a message.
            </p>
        </div>
        <div v-else>
            <p>There is currently no content available.</p>

            <p class="mt-1">
                If you have an account, first
                <router-link
                    :to="{ name: 'login' }"
                    class="text-yellow-600 underline hover:text-yellow-500"
                >
                    log in.
                </router-link>
            </p>
        </div>
    </div>
    <IgnorePagePadding v-else>
        <div class="space-y-4 pt-4">
            <!-- Display latest posts -->
            <HorizontalScrollableTagViewer
                title="Newest Content"
                :queryOptions="{
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'desc',
                    },
                    filterOptions: {
                        top: 10,
                    },
                }"
            />

            <!-- Display category tags -->
            <!-- <HorizontalScrollableTagViewer
                v-for="tag in tagsByTagType(TagType.Category, {
                    filterOptions: {
                        topLevelOnly: true,
                        includeEmpty: false,
                    },
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'desc',
                    },
                })"
                :key="tag._id"
                :tag="tag"
                :queryOptions="{
                    sortOptions: {
                        sortBy: 'publishDate',
                        sortOrder: 'asc',
                    },
                }"
            /> -->
        </div>
    </IgnorePagePadding>
</template>
