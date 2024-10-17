<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LCard from "@/components/common/LCard.vue";
import { type ContentDto } from "luminary-shared";

type Props = {
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");
</script>

<template>
    <LCard title="Seo settings" collapsible v-if="content">
        <!-- Title Seo -->
        <LInput name="seo-title" label="Title" :disabled="disabled" v-model="content.seoTitle" />

        <!-- Summary seo-->
        <LInput
            name="seo-summary"
            label="Summary"
            class="mt-4"
            :disabled="disabled"
            v-model="content.seoString"
        />
    </LCard>
</template>
