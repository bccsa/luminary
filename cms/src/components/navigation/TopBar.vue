<template>
    <div class="flex min-w-0 flex-1 items-center gap-x-3 self-stretch lg:gap-x-6">
        <div class="flex min-w-0 flex-1 items-center">
            <slot name="quickActions" />
        </div>
        <div v-if="$slots.contentActions" class="flex shrink-0 items-center gap-1">
            <slot name="contentActions" />
        </div>
    </div>
</template>
