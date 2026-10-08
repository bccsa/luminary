<script setup lang="ts">
/**
 * One choice in the player's speed, language and subtitles menus. The one in force is marked three
 * ways, so it reads at a glance and not by weight alone: a tinted row, a check, and bold.
 */
import { CheckIcon } from "@heroicons/vue/20/solid";

defineProps<{ label: string; selected: boolean }>();
defineEmits<{ pick: [] }>();
</script>

<template>
    <li>
        <button
            type="button"
            class="flex h-12 w-full items-center justify-between gap-3 px-4 text-left text-base"
            :class="
                selected
                    ? 'bg-yellow-500/20 font-bold text-yellow-900 dark:text-yellow-300'
                    : 'text-zinc-800 hover:bg-zinc-100 dark:text-slate-100 dark:hover:bg-slate-600'
            "
            :aria-current="selected ? 'true' : undefined"
            @click="$emit('pick')"
        >
            <span class="truncate">{{ label }}</span>
            <CheckIcon
                v-if="selected"
                class="h-5 w-5 flex-shrink-0"
                aria-hidden="true"
            />
        </button>
    </li>
</template>
