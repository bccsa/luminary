<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import ContentTable from "@/components/content/ContentTable.vue";
import LButton from "@/components/button/LButton.vue";
import EmptyState from "@/components/EmptyState.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { TagIcon } from "@heroicons/vue/24/solid";
import { RouterLink } from "vue-router";
import { storeToRefs } from "pinia";
import { useTagStore } from "@/stores/tag";
import { AclPermission, DocType, TagType } from "@/types";
import { useUserAccessStore } from "@/stores/userAccess";
import { computed } from "vue";

const { tags, categories } = storeToRefs(useTagStore());
const { hasAnyPermission } = useUserAccessStore();

const canCreateNew = computed(() => hasAnyPermission(DocType.Tag, AclPermission.Create));
</script>

<template>
    <BasePage title="Categories" :loading="tags === undefined">
        <template #actions>
            <LButton
                v-if="categories && categories.length > 0 && canCreateNew"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'tags.create', params: { tagType: TagType.Category } }"
            >
                Create category
            </LButton>
        </template>

        <EmptyState
            v-if="!categories || categories.length == 0"
            :icon="TagIcon"
            title="No categories yet"
            :description="
                canCreateNew
                    ? 'Get started by creating a new category.'
                    : 'You do not have permission to create new categories.'
            "
            buttonText="Create category"
            :buttonLink="{ name: 'tags.create', params: { tagType: TagType.Category } }"
            :buttonPermission="canCreateNew"
        />

        <ContentTable v-else :items="categories" :docType="DocType.Tag" editLinkName="tags.edit" />
    </BasePage>
</template>
