<script setup lang="ts">
import { RouterLink } from "vue-router";
import BasePage from "@/components/BasePage.vue";
// import ContentTable from "@/components/content/ContentTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import LButton from "@/components/button/LButton.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { usePostStore } from "@/stores/post";
import { storeToRefs } from "pinia";
import { AclPermission, DocType } from "@/types";
import { useUserAccessStore } from "@/stores/userAccess";
import { computed } from "vue";
import ContentTable2 from "@/components/content/ContentTable2.vue";

const { posts } = storeToRefs(usePostStore());
const { hasAnyPermission } = useUserAccessStore();

const canCreateNew = computed(() => hasAnyPermission(DocType.Post, AclPermission.Create));
</script>

<template>
    <BasePage title="Posts" :loading="posts === undefined">
        <template #actions>
            <LButton
                v-if="posts && posts.length > 0 && canCreateNew"
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
            :description="
                canCreateNew
                    ? 'Get started by creating a new post.'
                    : 'You do not have permission to create new posts.'
            "
            buttonText="Create post"
            :buttonLink="{ name: 'posts.create' }"
            :buttonPermission="canCreateNew"
        />

        <!-- <ContentTable v-else :items="posts" :docType="DocType.Post" editLinkName="posts.edit" /> -->
        <ContentTable2 :docType="DocType.Post" editLinkName="posts.edit" />
    </BasePage>
</template>
