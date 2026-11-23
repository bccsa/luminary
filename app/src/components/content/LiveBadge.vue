<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
    <span
        data-test="liveBadge"
        class="absolute left-2 top-2 z-30 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white shadow"
    >
        <span class="relative flex h-2 w-2" aria-hidden="true">
            <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75 motion-reduce:hidden"
            />
            <span class="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        {{ t("media_player.live") }}
    </span>
</template>
