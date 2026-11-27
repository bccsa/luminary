<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { CheckCircleIcon } from "@heroicons/vue/20/solid";
import LButton from "@/components/button/LButton.vue";

defineProps<{ selecting: boolean }>();

const { t } = useI18n();
</script>

<template>
    <LButton
        size="sm"
        :icon="selecting ? undefined : CheckCircleIcon"
        :aria-pressed="selecting"
        data-test="downloads-select"
    >
        {{ selecting ? t("downloads.page.select_done") : t("downloads.page.select") }}
    </LButton>
</template>
