<script setup lang="ts">
import { CheckCircleIcon } from "@heroicons/vue/24/solid";
import LButton from "@/components/button/LButton.vue";
import AuthShell from "./AuthShell.vue";
import { useAuthCopy } from "./useAuthCopy";

defineEmits<{ continue: [] }>();
const c = useAuthCopy();
</script>

<template>
    <AuthShell
        :title="c('auth.verify.done_title')"
        :subtitle="c('auth.verify.done_subtitle')"
    >
        <template #brand>
            <span
                class="flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/15"
            >
                <CheckCircleIcon class="h-7 w-7 text-green-600 dark:text-green-400" />
            </span>
        </template>

        <LButton
            variant="primary"
            size="xl"
            class="w-full"
            @click="$emit('continue')"
        >
            {{ c("auth.verify.done_continue") }}
        </LButton>
    </AuthShell>
</template>
