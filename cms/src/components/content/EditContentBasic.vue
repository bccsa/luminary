<script setup lang="ts">
import LCard from "@/components/common/LCard.vue";
import ContentBasic from "../content/ContentBasic.vue";
import ContentSEO from "../content/ContentSEO.vue";
import { ref } from "vue";
import type { ContentDto } from "luminary-shared";

type Props = {
    disabled: boolean;
};
defineProps<Props>();

const content = defineModel<ContentDto>("content");

const activeTab = ref(0);
const tabs = [
    { title: "General ", component: ContentBasic },
    { title: "SEO ", component: ContentSEO },
];
</script>

<template>
    <LCard title="General Settings" collapsible v-if="content">
        <!-- Tab Navigation -->
        <div>
            <nav class="flex space-x-4">
                <button
                    v-for="(tab, index) in tabs"
                    :key="tab.title"
                    @click="activeTab = index"
                    :class="{
                        'border-blue-600 text-blue-600': activeTab === index,
                        'border-transparent text-gray-500': activeTab !== index,
                    }"
                    class="border-b-2 py-2 text-sm font-medium"
                >
                    {{ tab.title }}
                </button>
            </nav>
        </div>

        <!-- Tab Content -->
        <div class="py-4">
            <component :is="tabs[activeTab].component" :disabled="disabled" :content="content" />
        </div>
    </LCard>
</template>
