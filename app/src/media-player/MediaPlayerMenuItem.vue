<script setup lang="ts">
/**
 * One choice in the player's speed, language and subtitles menus, a rounded row as the full-screen skin's.
 * The one in force is marked three ways, so it reads at a glance and not by weight alone: a tinted row, a
 * check, and bold.
 */
import V10Icon from "./V10Icon.vue";

defineProps<{ label: string; selected: boolean }>();
defineEmits<{ pick: [] }>();
</script>

<template>
    <li>
        <button
            type="button"
            class="flex h-10 w-full items-center justify-between gap-3 rounded-[9px] px-2.5 text-left text-sm"
            :class="
                selected
                    ? 'bg-yellow-500/20 font-bold text-yellow-900 dark:text-yellow-300'
                    : 'text-zinc-800 hover:bg-zinc-100 dark:text-slate-100 dark:hover:bg-slate-600'
            "
            :aria-current="selected ? 'true' : undefined"
            @click="$emit('pick')"
        >
            <span class="truncate">{{ label }}</span>
            <V10Icon
                v-if="selected"
                name="check"
                class="h-[18px] w-[18px] flex-shrink-0"
            />
        </button>
    </li>
</template>
