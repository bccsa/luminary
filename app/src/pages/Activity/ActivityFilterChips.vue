<script lang="ts" setup>
import { useI18n } from "vue-i18n";

defineProps<{
    filters: readonly string[];
    active: string;
}>();

defineEmits<{ select: [filter: string] }>();

const { t } = useI18n();
</script>

<template>
    <div
        class="flex flex-wrap gap-2"
        role="tablist"
        :aria-label="t('activity.title')"
    >
        <button
            v-for="filter in filters"
            :key="filter"
            type="button"
            role="tab"
            :aria-selected="filter === active"
            :data-test="`activity-filter-${filter}`"
            class="rounded-full px-3 py-1 text-sm transition-colors"
            :class="
                filter === active
                    ? 'bg-zinc-700 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
            "
            @click="$emit('select', filter)"
        >
            {{ t(`activity.filter.${filter}`) }}
        </button>
    </div>
</template>
