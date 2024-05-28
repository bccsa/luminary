<script setup lang="ts">
import HorizontalScrollableTagViewer from "@/components/tags/HorizontalScrollableTagViewer.vue";
import HorizontalScrollableLastPostViewer from "@/components/posts/HorizontalScrollableLastPostViewer.vue";
import { useTagStore } from "@/stores/tag";
import { usePostStore } from "@/stores/post";
import { TagType } from "@/types";
import { storeToRefs } from "pinia";
import IgnorePagePadding from "@/components/IgnorePagePadding.vue";
import { useAuth0 } from "@auth0/auth0-vue";

const { posts } = storeToRefs(usePostStore());
const { tagsByTagType } = storeToRefs(useTagStore());
const { isAuthenticated } = useAuth0();
</script>

<template>
    <div v-if="posts && posts.length == 0" class="text-zinc-800 dark:text-zinc-100">
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
        <div class="space-y-4">
            <!-- Display latest episodes -->
            <HorizontalScrollableLastPostViewer />
            <!-- Display category tags -->
            <HorizontalScrollableTagViewer
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
            />
        </div>
    </IgnorePagePadding>
</template>
