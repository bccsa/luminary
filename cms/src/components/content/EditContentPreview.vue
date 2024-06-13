<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import { EyeIcon, ArrowTopRightOnSquareIcon } from "@heroicons/vue/20/solid";
import { ContentStatus, type ContentDto } from "@/types";
import { computed } from "vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { client } from "@auth0/auth0-vue/dist/typings/plugin";

type Props = {
    content: ContentDto;
};

const props = defineProps<Props>();

const { clientAppUrl } = useGlobalConfigStore();
const liveUrl = computed(() => {
    if (!props.content) return "";
    console.log("props.content.slug: ", props.content.slug);
    console.log("clientAppUrl: ", clientAppUrl ? clientAppUrl : "http://localhost");
    const url = new URL(props.content.slug, clientAppUrl ? clientAppUrl : "http://localhost");
    return url.toString();
});
</script>

<template>
    <LCard
        title="View"
        :icon="EyeIcon"
        v-if="content && content.status == ContentStatus.Published"
        data-test="livePreview"
    >
        <LButton :icon="ArrowTopRightOnSquareIcon" iconRight is="a" :href="liveUrl" target="_blank"
            >View live version</LButton
        >
    </LCard>
</template>
