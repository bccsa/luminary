<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import { EyeIcon, ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";
import { PublishStatus, type ContentDto } from "luminary-shared";
import { computed } from "vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";

type Props = {
    content: ContentDto;
};

const props = defineProps<Props>();

const { clientAppUrl } = useGlobalConfigStore();
const liveUrl = computed(() => {
    if (!props.content) return "";
    const url = new URL(props.content.slug, clientAppUrl ? clientAppUrl : "http://localhost");
    return url.toString();
});
</script>

<template>
    <LCard
        title="View"
        :icon="EyeIcon"
        v-if="content && content.status == PublishStatus.Published"
        data-test="livePreview"
    >
        <LButton :icon="ArrowTopRightOnSquareIcon" iconRight is="a" :href="liveUrl" target="_blank"
            >View live version</LButton
        >
    </LCard>
</template>
