<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useRecommendations } from "@/composables/useRecommendations";
import { useImpressionTracking } from "@/composables/useImpressionTracking";
import { recordImpressionMiss } from "@/recommendation/affinityStore";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const { recommended } = useRecommendations();

const { root, onContainerClick } = useImpressionTracking(recommended, {
    onMiss: (tagIds) => void recordImpressionMiss(tagIds),
});
</script>

<template>
    <div ref="root" @click="onContainerClick">
        <HorizontalContentTileCollection
            v-if="recommended.length > 0"
            :contentDocs="recommended"
            :title="t('home.recommended')"
            :showPublishDate="false"
            class="pb-1 pt-4"
        />
    </div>
</template>
