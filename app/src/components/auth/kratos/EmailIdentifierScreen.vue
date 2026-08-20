<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import AuthShell from "./AuthShell.vue";
import AuthTextField from "./AuthTextField.vue";
import AuthMessage from "./AuthMessage.vue";
import { useAuthCopy } from "./useAuthCopy";
import type { AuthMessageType } from "./types";

type Props = {
    modelValue?: string;
    error?: string;
    message?: { type: AuthMessageType; text: string };
    busy?: boolean;
    /** Registration reuses this screen with its own heading and submit label. */
    mode?: "login" | "recovery";
};
const props = withDefaults(defineProps<Props>(), { busy: false, mode: "login" });
defineEmits<{ "update:modelValue": [value: string]; submit: []; back: [] }>();

const c = useAuthCopy();
const title = () => (props.mode === "recovery" ? c("auth.recovery.title") : c("auth.email.title"));
const subtitle = () =>
    props.mode === "recovery" ? c("auth.recovery.subtitle") : c("auth.email.subtitle");
const submitLabel = () =>
    props.mode === "recovery" ? c("auth.recovery.submit") : c("auth.email.submit");
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
            <AuthTextField
                :label="c('auth.email.label')"
                :placeholder="c('auth.email.placeholder')"
                :model-value="modelValue"
                :error="error"
                type="email"
                autocomplete="email"
                :disabled="busy"
                @update:model-value="$emit('update:modelValue', $event)"
            />
            <LButton
                variant="primary"
                size="xl"
                :disabled="busy"
                class="w-full"
            >
                {{ submitLabel() }}
            </LButton>
        </form>
    </AuthShell>
</template>
