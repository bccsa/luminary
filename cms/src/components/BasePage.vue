<script setup lang="ts">
import PageTitleSkeleton from "@/components/skeleton/PageTitleSkeleton.vue";
import ButtonSkeleton from "@/components/skeleton/ButtonSkeleton.vue";
import TableSkeleton from "@/components/skeleton/TableSkeleton.vue";

type Props = {
    title?: string;
    loading?: boolean;
};

withDefaults(defineProps<Props>(), {
    loading: false,
});
</script>

<template>
    <slot name="loading" v-if="loading">
        <div class="flex flex-col gap-4 pb-6 sm:flex-row sm:justify-between">
            <PageTitleSkeleton />

            <ButtonSkeleton />
        </div>

        <TableSkeleton />
    </slot>
    <div v-else>
        <header
            v-if="title || $slots.actions"
            class="flex flex-col gap-4 pb-6 sm:flex-row sm:justify-between"
        >
            <h1 class="text-lg font-semibold leading-7">{{ title }}</h1>

            <div v-if="$slots.actions">
                <slot name="actions" />
            </div>
        </header>

        <div>
            <slot />
        </div>
    </div>
</template>
