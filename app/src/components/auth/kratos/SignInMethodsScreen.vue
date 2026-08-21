<script setup lang="ts">
import { EnvelopeIcon, ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import AuthShell from "./AuthShell.vue";
import AuthMessage from "./AuthMessage.vue";
import { useAuthCopy } from "./useAuthCopy";
import type { AuthMessageType, AuthProviderOption } from "./types";

type Props = {
    providers?: AuthProviderOption[];
    message?: { type: AuthMessageType; text: string };
    /** Guests reach this screen from a gate; a first-run visitor can still walk away. */
    showGuestExit?: boolean;
};
withDefaults(defineProps<Props>(), { providers: () => [], showGuestExit: true });
defineEmits<{ email: []; provider: [id: string]; guest: [] }>();

const c = useAuthCopy();
</script>

<template>
    <AuthShell
        :title="c('auth.methods.title')"
        :subtitle="c('auth.methods.subtitle')"
    >
        <AuthMessage
            v-if="message"
            :type="message.type"
            :text="message.text"
        />

        <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-4 text-start hover:bg-zinc-50 dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600/60"
            @click="$emit('email')"
        >
            <span
                class="flex size-9 shrink-0 items-center justify-center rounded-md bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
            >
                <EnvelopeIcon class="h-5 w-5" />
            </span>
            <span class="text-[15px] font-medium text-zinc-800 dark:text-slate-100">
                {{ c("auth.methods.guest_sign_in") }}
            </span>
        </button>

        <div
            v-if="providers.length"
            class="flex items-center gap-3"
        >
            <span class="h-px flex-1 bg-zinc-200 dark:bg-slate-600" />
            <span class="text-xs uppercase tracking-wide text-zinc-400 dark:text-slate-400">
                {{ c("auth.methods.divider") }}
            </span>
            <span class="h-px flex-1 bg-zinc-200 dark:bg-slate-600" />
        </div>

        <div class="flex flex-col gap-3">
            <button
                v-for="provider in providers"
                :key="provider.id"
                type="button"
                class="group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border border-zinc-200 bg-white px-4 py-4 hover:shadow-sm dark:border-slate-600 dark:bg-slate-700"
                :style="
                    provider.backgroundColor
                        ? {
                              backgroundColor: provider.backgroundColor,
                              borderColor: provider.backgroundColor,
                          }
                        : {}
                "
                @click="$emit('provider', provider.id)"
            >
                <span
                    class="pointer-events-none absolute inset-0 bg-white opacity-0 group-hover:opacity-20"
                />
                <img
                    v-if="provider.iconUrl"
                    :src="provider.iconUrl"
                    alt=""
                    class="size-5 shrink-0"
                />
                <span
                    class="text-[15px] font-medium text-zinc-700 group-hover:text-zinc-900 dark:text-slate-200 dark:group-hover:text-white"
                    :style="provider.textColor ? { color: provider.textColor } : {}"
                >
                    {{ provider.label }}
                </span>
            </button>
        </div>

        <div
            v-if="!providers.length && message?.type === 'error'"
            class="flex flex-col items-center gap-3 py-4 text-center"
        >
            <span class="rounded-full bg-zinc-100 p-3 dark:bg-slate-700">
                <ExclamationTriangleIcon class="h-6 w-6 text-zinc-400 dark:text-slate-400" />
            </span>
            <p class="text-sm text-zinc-500 dark:text-slate-400">{{ c("auth.methods.none") }}</p>
        </div>

        <template
            v-if="showGuestExit"
            #footer
        >
            <div class="flex flex-col items-center gap-3">
                <!-- A text link, never a third button: continuing as a guest is a dismissal, not a sign-in method. -->
                <button
                    type="button"
                    class="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:text-slate-400 dark:hover:text-slate-100"
                    @click="$emit('guest')"
                >
                    {{ c("auth.methods.guest") }}
                </button>
                <p class="text-center text-xs text-zinc-400 dark:text-slate-500">
                    {{ c("auth.common.privacy_note") }}
                </p>
            </div>
        </template>
    </AuthShell>
</template>
