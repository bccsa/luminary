<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useRecommendations } from "@/composables/useRecommendations";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const { recommended } = useRecommendations();
</script>

<template>
    <HorizontalContentTileCollection
        v-if="recommended.length > 0"
        :contentDocs="recommended"
        :title="t('home.recommended')"
        :showPublishDate="true"
        class="pb-1 pt-4"
    />
</template>
