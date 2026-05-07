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
            '-mx-2',
            ignoreTop ? (mobileOnly ? '-mt-2 md:mt-0' : '-mt-2') : '',
            ignoreBottom ? (mobileOnly ? '-mb-2 md:mb-0' : '-mb-2') : '',
        ]"
    >
        <slot />
    </div>
</template>
