<script setup lang="ts">
withDefaults(
    defineProps<{
        mobileOnly?: boolean;
        ignoreTop?: boolean;
        ignoreBottom?: boolean;
    }>(),
    {
        mobileOnly: false,
        ignoreTop: false,
        ignoreBottom: false,
    },
);
</script>

<template>
    <div
        :class="[
            mobileOnly ? 'md:mx-0' : '',
            '-mx-4',
            ignoreTop ? (mobileOnly ? '-mt-4 md:mt-0' : '-mt-4') : '',
            ignoreBottom ? (mobileOnly ? '-mb-4 md:mb-0' : '-mb-4') : '',
        ]"
    >
        <slot />
    </div>
</template>
