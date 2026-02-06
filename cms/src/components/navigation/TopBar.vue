<template>
    <div class="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div class="relative flex flex-1 items-center justify-between gap-1">
            <slot name="quickActions" />
        </div>
    </div>
    <div v-if="$slots.contentActions">
        <slot name="contentActions" />
    </div>
</template>
