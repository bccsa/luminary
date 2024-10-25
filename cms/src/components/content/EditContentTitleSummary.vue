<script setup lang="ts">
import LCard from "@/components/common/LCard.vue";
import LTabs from "@/components/common/LTabs.vue";
import EditContentBasic from "@/components/content/EditContentBasic.vue";
import LInput from "@/components/forms/LInput.vue";
import { ref } from "vue";
import type { ContentDto } from "luminary-shared";

type Props = {
    disabled: boolean;
};
defineProps<Props>();

const content = defineModel<ContentDto>("content");

const currentTab = ref("visible"); // Default tab key
const tabs = [
    { title: "Visible title & summary", key: "visible", component: EditContentBasic },
    { title: "SEO title & summary", key: "seo" },
];
</script>

<template>
    <LCard title="Title & summary" collapsible v-if="content">
        <!-- Tab Navigation using LTabs -->
        <LTabs :tabs="tabs" :currentTab="currentTab" @update:currentTab="currentTab = $event" />

        <!-- Tab Content -->
        <div class="py-4">
            <component
                v-if="currentTab === 'visible'"
                :is="EditContentBasic"
                :disabled="disabled"
                :content="content"
            />
            <div v-else-if="currentTab === 'seo'">
                <!-- Title SEO -->
                <LInput
                    name="seo-title"
                    label="Title"
                    :disabled="disabled"
                    :placeholder="content.title"
                    v-model="content.seoTitle"
                />

                <!-- Summary SEO -->
                <LInput
                    name="seo-summary"
                    label="Summary"
                    class="mt-4"
                    :disabled="disabled"
                    :placeholder="content.summary"
                    v-model="content.seoString"
                />
            </div>
        </div>
    </LCard>
</template>
