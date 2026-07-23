<script setup lang="ts">
import { ref } from "vue";
import DisplayCard from "@/components/common/DisplayCard.vue";
import LBadge from "@/components/common/LBadge.vue";
import EditStartingInterestModal from "./EditStartingInterestModal.vue";
import type { Uuid } from "luminary-shared";

type Props = {
    tagId: Uuid;
    label: string;
    score: number;
    updatedTimeUtc: number;
};

defineProps<Props>();

const isModalVisible = ref(false);
</script>

<template>
    <DisplayCard :title="label" :updated-time-utc="updatedTimeUtc" @click="isModalVisible = true">
        <template #topRightContent>
            <LBadge>{{ Math.round(score * 100) }}%</LBadge>
        </template>
    </DisplayCard>

    <EditStartingInterestModal
        v-if="isModalVisible"
        v-model:is-visible="isModalVisible"
        :tagId="tagId"
        :label="label"
        :score="score"
    />
</template>
