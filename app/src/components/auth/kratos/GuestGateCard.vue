<script setup lang="ts">
import { BookmarkIcon } from "@heroicons/vue/24/outline";
import LButton from "@/components/button/LButton.vue";
import { useAuthCopy } from "./useAuthCopy";

defineEmits<{ signIn: []; dismiss: [] }>();
const c = useAuthCopy();
</script>

<template>
    <!-- Shown in place, where the guest hit the limit — not as a modal that interrupts reading. -->
    <div
        class="flex w-full max-w-md items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-slate-700 dark:bg-slate-800"
    >
        <span
            class="flex size-9 shrink-0 items-center justify-center rounded-md bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
        >
            <BookmarkIcon class="h-5 w-5" />
        </span>
        <div class="flex min-w-0 flex-col gap-2">
            <p class="text-sm font-semibold text-zinc-900 dark:text-slate-100">
                {{ c("auth.gate.bookmarks_title") }}
            </p>
            <p class="text-sm leading-relaxed text-zinc-500 dark:text-slate-400">
                {{ c("auth.gate.bookmarks_body") }}
            </p>
            <div class="mt-1 flex items-center gap-2">
                <LButton
                    variant="primary"
                    size="sm"
                    @click="$emit('signIn')"
                >
                    {{ c("auth.gate.sign_in") }}
                </LButton>
                <LButton
                    variant="tertiary"
                    size="sm"
                    @click="$emit('dismiss')"
                >
                    {{ c("auth.gate.dismiss") }}
                </LButton>
            </div>
        </div>
    </div>
</template>
