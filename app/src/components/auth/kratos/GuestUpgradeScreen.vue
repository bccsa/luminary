<script setup lang="ts">
import { BookmarkIcon, ChartBarIcon } from "@heroicons/vue/24/outline";
import LButton from "@/components/button/LButton.vue";
import AuthShell from "./AuthShell.vue";
import { useAuthCopy } from "./useAuthCopy";

type Props = { bookmarkCount?: number };
withDefaults(defineProps<Props>(), { bookmarkCount: 0 });
defineEmits<{ upgrade: []; later: [] }>();

const c = useAuthCopy();
</script>

<template>
    <AuthShell
        :title="c('auth.upgrade.title')"
        :subtitle="c('auth.upgrade.subtitle')"
    >
        <ul class="flex flex-col gap-3">
            <li class="flex items-center gap-3">
                <span
                    class="flex size-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-slate-700 dark:text-slate-300"
                >
                    <BookmarkIcon class="h-4 w-4" />
                </span>
                <span class="text-sm text-zinc-700 dark:text-slate-200">
                    {{ c("auth.upgrade.bookmarks", { count: bookmarkCount }) }}
                </span>
            </li>
            <li class="flex items-center gap-3">
                <span
                    class="flex size-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-slate-700 dark:text-slate-300"
                >
                    <ChartBarIcon class="h-4 w-4" />
                </span>
                <span class="text-sm text-zinc-700 dark:text-slate-200">
                    {{ c("auth.upgrade.progress") }}
                </span>
            </li>
        </ul>

        <LButton
            variant="primary"
            size="xl"
            class="w-full"
            @click="$emit('upgrade')"
        >
            {{ c("auth.upgrade.submit") }}
        </LButton>

        <template #footer>
            <button
                type="button"
                class="w-full text-center text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:text-slate-400 dark:hover:text-slate-100"
                @click="$emit('later')"
            >
                {{ c("auth.upgrade.later") }}
            </button>
        </template>
    </AuthShell>
</template>
