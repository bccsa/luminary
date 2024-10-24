<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import { type ContentDto } from "luminary-shared";

type Props = {
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");
</script>

<template>
    <div v-if="content">
        <!-- Title Seo -->
        <LInput
            name="seo-title"
            label="Title"
            :disabled="disabled"
            :placeholder="content.title"
            v-model="content.seoTitle"
        />

        <!-- Summary seo-->
        <LInput
            name="seo-summary"
            label="Summary"
            class="mt-4"
            :disabled="disabled"
            :placeholder="content.summary"
            v-model="content.seoString"
        />
    </div>
</template>
