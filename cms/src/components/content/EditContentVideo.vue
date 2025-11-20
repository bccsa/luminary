<script setup lang="ts">
import LCard from "@/components/common/LCard.vue";
import LInput from "@/components/forms/LInput.vue";
import { VideoCameraIcon, LinkIcon } from "@heroicons/vue/20/solid";
import { type ContentDto } from "luminary-shared";
import { ref, watch } from "vue";

type Props = {
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");

const collapsed = ref(false);
const hasInitialized = ref(false);

// Collapse the card only initially if there's no video
watch(
    () => content.value?.video,
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
        v-if="content"
        title="Video"
        :icon="VideoCameraIcon"
        collapsible
        :collapsed="collapsed"
        data-test="videoContent"
        class="bg-white"
    >
        <LInput
            name="video"
            v-model="content.video"
            :icon="LinkIcon"
            placeholder="https://... or https://youtube.com/..."
            :disabled="disabled"
            class="pb-1"
        />
    </LCard>
</template>
