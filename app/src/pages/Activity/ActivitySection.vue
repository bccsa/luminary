<script lang="ts" setup>
import { useI18n } from "vue-i18n";
import type { ActivityGroup } from "./activityGroups";

defineProps<{ group: ActivityGroup }>();

const { t } = useI18n();
</script>

<template>
    <section class="mb-6">
        <h2
            class="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-slate-400"
            :data-test="`activity-group-${group}`"
        >
            {{ t(`activity.group.${group}`) }}
        </h2>
        <slot />
    </section>
</template>
