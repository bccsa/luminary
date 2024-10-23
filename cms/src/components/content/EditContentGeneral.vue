<script setup lang="ts">
import LCard from "@/components/common/LCard.vue";
import LTabs from "@/components/common/LTabs.vue";
import EditContentBasic from "@/components/content/EditContentBasic.vue";
import EditContentSeo from "@/components/content/EditContentSeo.vue";
import { ref } from "vue";
import type { ContentDto } from "luminary-shared";

type Props = {
    disabled: boolean;
};
defineProps<Props>();

const content = defineModel<ContentDto>("content");

const currentTab = ref("basic"); // Default tab key
const tabs = [
    { title: "Basic", key: "basic", component: EditContentBasic },
    { title: "Seo", key: "seo", component: EditContentSeo },
];
</script>

<template>
    <LCard title="General settings" collapsible v-if="content">
        <!-- Tab Navigation using LTabs -->
        <LTabs :tabs="tabs" :currentTab="currentTab" @update:currentTab="currentTab = $event" />

        <!-- Tab Content -->
        <div class="py-4">
            <component
                :is="tabs.find((tab) => tab.key === currentTab)?.component"
                :disabled="disabled"
                :content="content"
            />
        </div>
    </LCard>
</template>
