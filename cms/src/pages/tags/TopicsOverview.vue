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

const { tags, topics } = storeToRefs(useTagStore());
const { hasAnyPermission } = useUserAccessStore();

const canCreateNew = computed(() => hasAnyPermission(DocType.Tag, AclPermission.Create));
</script>

<template>
    <BasePage title="Topics" :loading="tags === undefined">
        <template #actions>
            <LButton
                v-if="topics && topics.length > 0 && canCreateNew"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'tags.create', params: { tagType: TagType.Topic } }"
            >
                Create topic
            </LButton>
        </template>

        <EmptyState
            v-if="!topics || topics.length == 0"
            :icon="TagIcon"
            title="No topics yet"
            :description="
                canCreateNew
                    ? 'Get started by creating a new topic.'
                    : 'You do not have permission to create new topics.'
            "
            buttonText="Create topic"
            :buttonLink="{ name: 'tags.create', params: { tagType: TagType.Topic } }"
            :buttonPermission="canCreateNew"
        />

        <ContentTable v-else :items="topics" :docType="DocType.Tag" editLinkName="tags.edit" />
    </BasePage>
</template>
