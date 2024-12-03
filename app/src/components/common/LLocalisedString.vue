<script setup lang="ts">
import { appLanguageIdAsRef } from "@/globalConfig";
import { useI18n } from "vue-i18n";

const { t } = useI18n(); // move this to globalConfig so that it is only instantiated once. We want a global funtion to which we pass an id, and it returns the string in the current language.
type Props = {
    id: string;
};
defineProps<Props>();
</script>

<template>
    <span :key="appLanguageIdAsRef">{{ t(id) }}</span>
</template>
