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

const { tags, audioPlaylists } = storeToRefs(useTagStore());
</script>

<template>
    <BasePage title="Audio playlists" :loading="tags === undefined">
        <template #actions>
            <LButton
                v-if="audioPlaylists && audioPlaylists.length > 0"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: 'tags.create' }"
            >
                Create audio playlist
            </LButton>
        </template>

        <EmptyState
            v-if="!audioPlaylists || audioPlaylists.length == 0"
            :icon="TagIcon"
            title="No audio playlists yet"
            description="Get started by creating a new audio playlist."
            buttonText="Create audio playlist"
            :buttonLink="{ name: 'tags.create' }"
        />

        <ContentTable v-else :items="audioPlaylists" editLinkName="tags.edit" />
    </BasePage>
</template>
