<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LInput from "@/components/forms/LInput.vue";
import { VideoCameraIcon, LinkIcon } from "@heroicons/vue/20/solid";
import { type ContentDto } from "luminary-shared";

type Props = {
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");
</script>

<template>
    <LButton
        v-if="content && content?.video == undefined && !disabled"
        type="button"
        variant="tertiary"
        :icon="VideoCameraIcon"
        data-test="addVideo"
        @click="content.video = ''"
    >
        Add Video
    </LButton>
    <LCard
        v-if="content?.video != undefined"
        title="Video"
        :icon="VideoCameraIcon"
        collapsible
        data-test="videoContent"
    >
        <LInput
            v-model="content.video"
            name="video"
            :icon="LinkIcon"
            placeholder="https://..."
            :disabled="disabled"
        />
    </LCard>
</template>
