<script setup lang="ts">
import HorizontalContentTileCollection from "@/components/content/HorizontalContentTileCollection.vue";
import { useCommunityRecommendations } from "@/composables/useCommunityRecommendations";
import { useI18n } from "vue-i18n";

// No impression tracking here, unlike the personal row: a miss on this row is evidence about
// the crowd's picks, not the user's taste, and feeding it back would let the community feed
// quietly steer the profile it is meant to stay out of.
const { t } = useI18n();
const { recommended } = useCommunityRecommendations();
</script>

<template>
    <HorizontalContentTileCollection
        v-if="recommended.length > 0"
        :contentDocs="recommended"
        :title="t('home.communityRecommended')"
        :showPublishDate="false"
        class="pb-1 pt-4"
    />
</template>
