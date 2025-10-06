<script setup lang="ts">
import LCard from "@/components/common/LCard.vue";
import LInput from "@/components/forms/LInput.vue";
import { VideoCameraIcon, LinkIcon } from "@heroicons/vue/20/solid";
import { type ContentParentDto } from "luminary-shared";
import { ref, watch } from "vue";

type Props = {
    disabled: boolean;
};
defineProps<Props>();
const parent = defineModel<ContentParentDto>("parent");

const collapsed = ref(false);
const hasInitialized = ref(false);

// Collapse the card only initially if there's no video
watch(
    () => parent.value?.media?.hlsUrl,
    (video) => {
        if (!hasInitialized.value) {
            collapsed.value = video == null || video === "";
            hasInitialized.value = true;
        }
        // DO NOTHING after initial render
    },
    { immediate: true },
);
</script>

<template>
    <LCard
        v-if="parent && parent.media"
        title="Video"
        :icon="VideoCameraIcon"
        collapsible
        :collapsed="collapsed"
        data-test="videoContent"
        class="bg-white"
    >
        <LInput
            name="video"
            v-model="parent.media.hlsUrl"
            :icon="LinkIcon"
            placeholder="https://... or https://youtube.com/..."
            :disabled="disabled"
            class="pb-1"
        />
    </LCard>
</template>
