<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import AuthShell from "./AuthShell.vue";
import AuthTextField from "./AuthTextField.vue";
import AuthMessage from "./AuthMessage.vue";
import { useAuthCopy } from "./useAuthCopy";
import type { AuthMessageType } from "./types";

type Props = {
    email?: string;
    name?: string;
    emailError?: string;
    message?: { type: AuthMessageType; text: string };
    busy?: boolean;
};
withDefaults(defineProps<Props>(), { busy: false });
defineEmits<{
    "update:email": [value: string];
    "update:name": [value: string];
    submit: [];
    signIn: [];
    back: [];
}>();

const c = useAuthCopy();
</script>

<template>
    <AuthShell
        :title="c('auth.register.title')"
        :subtitle="c('auth.register.subtitle')"
        can-go-back
        @back="$emit('back')"
    >
        <AuthMessage
            v-if="message"
            :type="message.type"
            :text="message.text"
        />

        <form
            class="flex flex-col gap-4"
            @submit.prevent="$emit('submit')"
        >
            <AuthTextField
                :label="c('auth.email.label')"
                :placeholder="c('auth.email.placeholder')"
                :model-value="email"
                :error="emailError"
                type="email"
                autocomplete="email"
                :disabled="busy"
                @update:model-value="$emit('update:email', $event)"
            />
            <AuthTextField
                :label="c('auth.register.name_label')"
                :placeholder="c('auth.register.name_placeholder')"
                :model-value="name"
                autocomplete="name"
                :disabled="busy"
                @update:model-value="$emit('update:name', $event)"
            />
            <LButton
                variant="primary"
                size="xl"
                :disabled="busy"
                class="w-full"
            >
                {{ c("auth.register.submit") }}
            </LButton>
        </form>

        <template #footer>
            <div class="flex flex-col items-center gap-3">
                <button
                    type="button"
                    class="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:text-slate-400 dark:hover:text-slate-100"
                    @click="$emit('signIn')"
                >
                    {{ c("auth.register.have_account") }}
                </button>
                <p class="text-center text-xs text-zinc-400 dark:text-slate-500">
                    {{ c("auth.common.privacy_note") }}
                </p>
            </div>
        </template>
    </AuthShell>
</template>
