<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import AuthShell from "./AuthShell.vue";
import AuthCodeInput from "./AuthCodeInput.vue";
import AuthMessage from "./AuthMessage.vue";
import { useAuthCopy } from "./useAuthCopy";
import type { AuthMessageType } from "./types";

type Props = {
    email: string;
    modelValue?: string;
    message?: { type: AuthMessageType; text: string };
    busy?: boolean;
    /** Seconds until a new code may be requested; 0 enables the resend button. */
    resendIn?: number;
    /** Verification says "confirm", login says "sign in" — same flow shape, different words. */
    mode?: "login" | "verification";
};
const props = withDefaults(defineProps<Props>(), { busy: false, resendIn: 0, mode: "login" });
defineEmits<{
    "update:modelValue": [value: string];
    submit: [];
    resend: [];
    changeEmail: [];
    back: [];
}>();

const c = useAuthCopy();
const title = () => (props.mode === "verification" ? c("auth.verify.title") : c("auth.code.title"));
const subtitle = () =>
    props.mode === "verification"
        ? c("auth.verify.subtitle", { email: props.email })
        : c("auth.code.subtitle", { email: props.email });
const submitLabel = () =>
    props.mode === "verification" ? c("auth.verify.submit") : c("auth.code.submit");
</script>

<template>
    <AuthShell
        :title="title()"
        :subtitle="subtitle()"
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
            <AuthCodeInput
                :label="c('auth.code.label')"
                :model-value="modelValue"
                :error="message?.type === 'error'"
                :disabled="busy"
                @update:model-value="$emit('update:modelValue', $event)"
                @complete="$emit('submit')"
            />
            <LButton
                variant="primary"
                size="xl"
                :disabled="busy || (modelValue?.length ?? 0) < 6"
                class="w-full"
            >
                {{ submitLabel() }}
            </LButton>
        </form>

        <template #footer>
            <div class="flex flex-col items-center gap-2 text-sm">
                <button
                    v-if="!resendIn"
                    type="button"
                    class="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-slate-200 dark:hover:text-white"
                    @click="$emit('resend')"
                >
                    {{ c("auth.code.resend") }}
                </button>
                <span
                    v-else
                    class="tabular-nums text-zinc-400 dark:text-slate-500"
                >
                    {{ c("auth.code.resend_in", { seconds: resendIn }) }}
                </span>
                <button
                    type="button"
                    class="text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:text-slate-400 dark:hover:text-slate-100"
                    @click="$emit('changeEmail')"
                >
                    {{ c("auth.code.change_email") }}
                </button>
            </div>
        </template>
    </AuthShell>
</template>
