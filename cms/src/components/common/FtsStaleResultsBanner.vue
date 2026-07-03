<script setup lang="ts">
type Props = {
    visible: boolean;
    loading?: boolean;
};

withDefaults(defineProps<Props>(), {
    loading: false,
});

const emit = defineEmits<{
    refresh: [];
}>();
</script>

<template>
    <div
        v-if="visible"
        data-test="fts-stale-banner"
        class="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600"
    >
        <span>Results may have changed.</span>
        <button
            type="button"
            class="font-medium text-zinc-800 underline hover:text-zinc-950 disabled:opacity-50"
            :disabled="loading"
            data-test="fts-stale-refresh"
            @click="emit('refresh')"
        >
            Refresh
        </button>
    </div>
</template>
