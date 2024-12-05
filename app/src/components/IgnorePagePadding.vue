<script setup lang="ts">
withDefaults(
    defineProps<{
        mobileOnly?: boolean;
        ignoreTop?: boolean;
    }>(),
    {
        mobileOnly: false,
        ignoreTop: false,
    },
);
</script>

<template>
    <div
        :class="[
            mobileOnly ? 'md:mx-0' : '',
            '-mx-4',
            ignoreTop ? (mobileOnly ? '-mt-4 md:mt-0' : '-mt-4') : '',
        ]"
    >
        <slot />
    </div>
</template>
