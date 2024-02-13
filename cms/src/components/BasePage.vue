<script setup lang="ts">
type Props = {
    title?: string;
    loading?: boolean;
};

withDefaults(defineProps<Props>(), {
    loading: false,
});
</script>

<template>
    <transition
        enter-active-class="transition ease duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
    >
        <div v-if="!loading">
            <header
                v-if="title || $slots.actions"
                class="flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between"
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
    </transition>
</template>
