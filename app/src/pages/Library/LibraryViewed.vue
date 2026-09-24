<script lang="ts" setup>
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
    <div
        class="text-zinc-500 dark:text-slate-200"
        data-test="library-viewed"
    >
        {{ t("library.viewed.empty_page") }}
    </div>
</template>
