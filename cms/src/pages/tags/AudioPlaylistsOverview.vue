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

const { tags, audioPlaylists } = storeToRefs(useTagStore());
const { hasAnyPermission } = useUserAccessStore();

const canCreateNew = computed(() => hasAnyPermission(DocType.Tag, AclPermission.Create));
</script>

<template>
    <BasePage title="Audio playlists" :loading="tags === undefined">
        <template #actions>
            <LButton
                v-if="audioPlaylists && audioPlaylists.length > 0 && canCreateNew"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'tags.create', params: { tagType: TagType.AudioPlaylist } }"
            >
                Create audio playlist
            </LButton>
        </template>

        <EmptyState
            v-if="!audioPlaylists || audioPlaylists.length == 0"
            :icon="TagIcon"
            title="No audio playlists yet"
            :description="
                canCreateNew
                    ? 'Get started by creating a new audio playlist.'
                    : 'You do not have permission to create new audio playlists.'
            "
            buttonText="Create audio playlist"
            :buttonLink="{ name: 'tags.create', params: { tagType: TagType.AudioPlaylist } }"
            :buttonPermission="canCreateNew"
        />

        <ContentTable
            v-else
            :items="audioPlaylists"
            :docType="DocType.Tag"
            editLinkName="tags.edit"
        />
    </BasePage>
</template>
