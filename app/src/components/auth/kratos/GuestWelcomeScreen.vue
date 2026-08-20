<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import AuthShell from "./AuthShell.vue";
import { useAuthCopy } from "./useAuthCopy";

type Props = { appName?: string; logoUrl?: string };
withDefaults(defineProps<Props>(), { appName: "Luminary" });
defineEmits<{ signIn: []; guest: [] }>();

const c = useAuthCopy();
</script>

<template>
    <AuthShell
        :title="c('auth.guest.title')"
        :subtitle="c('auth.guest.subtitle')"
    >
        <template #brand>
            <div class="flex items-center gap-3">
                <img
                    v-if="logoUrl"
                    :src="logoUrl"
                    alt=""
                    class="h-9 w-9"
                />
                <span class="text-lg font-semibold text-zinc-900 dark:text-slate-100">
                    {{ appName }}
                </span>
            </div>
        </template>

        <LButton
            variant="primary"
            size="xl"
            class="w-full"
            @click="$emit('signIn')"
        >
            {{ c("auth.guest.sign_in") }}
        </LButton>
        <LButton
            variant="secondary"
            size="xl"
            class="w-full"
            @click="$emit('guest')"
        >
            {{ c("auth.guest.continue") }}
        </LButton>
    </AuthShell>
</template>
