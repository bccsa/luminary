<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import ContentForm from "@/components/content/ContentForm.vue";
import AcSelect from "@/components/forms/AcSelect.vue";
import { ref } from "vue";

const languageOptions = [
    { label: "English", value: "en" },
    { label: "Swahili", value: "sw" },
    { label: "Chichewa", value: "ny" },
    { label: "Español", value: "es", disabled: true },
];
const selectedLanguage = ref("sw");
</script>

<template>
    <BasePage title="Post title">
        <template #actions>
            <AcSelect :options="languageOptions" v-model="selectedLanguage" />
        </template>

        <ContentForm type="post" />
    </BasePage>
</template>
