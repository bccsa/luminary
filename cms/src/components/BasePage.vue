<script setup lang="ts">
type Props = {
    title?: string;
    sticky?: boolean;
};

withDefaults(defineProps<Props>(), {
    sticky: false,
});
</script>

<template>
    <div>
        <header
            v-if="title || $slots.actions"
            class="-mx-4 -mt-10 flex flex-col gap-4 bg-white px-4 pb-6 pt-10 sm:-mx-6 sm:flex-row sm:justify-between sm:px-6 lg:-mx-8 lg:px-8"
            :class="{ 'sticky top-16 z-10': sticky }"
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
