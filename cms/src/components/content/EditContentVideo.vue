<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LInput from "@/components/forms/LInput.vue";
import { VideoCameraIcon, LinkIcon } from "@heroicons/vue/20/solid";
import { type ContentDto } from "@/types";

type Props = {
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");
</script>

<template>
    <LButton
        type="button"
        variant="tertiary"
        :icon="VideoCameraIcon"
        v-if="content && content?.video == undefined && !disabled"
        @click="content.video = ''"
        data-test="addText"
    >
        Add Video
    </LButton>
    <LCard title="Video" :icon="VideoCameraIcon" collapsible v-show="content?.video != undefined">
        <LInput name="video" :icon="LinkIcon" placeholder="https://..." :disabled="disabled" />
    </LCard>
</template>
