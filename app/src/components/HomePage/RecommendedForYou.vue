<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useRecommendations } from "@/composables/useRecommendations";
import { useImpressionTracking } from "@/composables/useImpressionTracking";
import { recordImpressionMiss } from "@/recommendation/affinityStore";
import { useI18n } from "vue-i18n";
import { onActivated, onDeactivated } from "vue";

const { t } = useI18n();
const { recommended, setVisible } = useRecommendations({ freezeSignals: true });

// Home is kept alive: while the user reads elsewhere the feed may re-rank off-screen.
onActivated(() => setVisible(true));
onDeactivated(() => setVisible(false));

const { root, onContainerClick } = useImpressionTracking(recommended, {
    onMiss: (tagIds) => void recordImpressionMiss(tagIds),
});
</script>

<template>
    <div
        ref="root"
        @click="onContainerClick"
    >
        <HorizontalContentTileCollection
            v-if="recommended.length > 0"
            :contentDocs="recommended"
            :title="t('home.recommended')"
            :showPublishDate="false"
            useVerticalTileLayout
            class="pb-1 pt-4"
        />
    </div>
</template>
