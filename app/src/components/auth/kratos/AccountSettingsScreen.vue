<script setup lang="ts">
import {
    CheckBadgeIcon,
    ComputerDesktopIcon,
    DevicePhoneMobileIcon,
} from "@heroicons/vue/24/outline";
import LButton from "@/components/button/LButton.vue";
import { useAuthCopy } from "./useAuthCopy";
import type { AuthProviderOption } from "./types";

export type LinkedMethod = AuthProviderOption & { linked: boolean };
export type ActiveSession = {
    id: string;
    device: string;
    location?: string;
    lastSeen: string;
    current?: boolean;
};

type Props = {
    email: string;
    emailVerified?: boolean;
    methods?: LinkedMethod[];
    sessions?: ActiveSession[];
    /** Kratos has no self-service identity deletion, so hosts that lack it hide the offer. */
    canDelete?: boolean;
};
withDefaults(defineProps<Props>(), {
    emailVerified: true,
    methods: () => [],
    sessions: () => [],
    canDelete: true,
});
defineEmits<{
    changeEmail: [];
    toggleMethod: [id: string];
    signOutOthers: [];
    deleteAccount: [];
}>();

const c = useAuthCopy();
</script>

<template>
    <div class="flex w-full max-w-md flex-col gap-4">
        <h1 class="text-xl font-semibold text-zinc-900 dark:text-slate-100">
            {{ c("auth.settings.title") }}
        </h1>

        <section
            class="rounded-lg border border-zinc-100 bg-white p-4 shadow dark:border-slate-800 dark:bg-slate-800"
        >
            <h2 class="text-sm font-semibold text-zinc-500 dark:text-slate-400">
                {{ c("auth.settings.email_section") }}
            </h2>
            <div class="mt-3 flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate text-[15px] text-zinc-900 dark:text-slate-100">
                        {{ email }}
                    </span>
                    <CheckBadgeIcon
                        v-if="emailVerified"
                        class="h-5 w-5 shrink-0 text-green-600 dark:text-green-400"
                    />
                </div>
                <LButton
                    variant="secondary"
                    size="sm"
                    @click="$emit('changeEmail')"
                >
                    {{ c("auth.settings.change") }}
                </LButton>
            </div>
        </section>

        <section
            v-if="methods.length"
            class="rounded-lg border border-zinc-100 bg-white p-4 shadow dark:border-slate-800 dark:bg-slate-800"
        >
            <h2 class="text-sm font-semibold text-zinc-500 dark:text-slate-400">
                {{ c("auth.settings.methods_section") }}
            </h2>
            <ul class="mt-2 divide-y divide-zinc-100 dark:divide-slate-700">
                <li
                    v-for="method in methods"
                    :key="method.id"
                    class="flex items-center justify-between gap-3 py-3"
                >
                    <div class="flex min-w-0 items-center gap-2.5">
                        <img
                            v-if="method.iconUrl"
                            :src="method.iconUrl"
                            alt=""
                            class="size-5 shrink-0"
                        />
                        <span class="truncate text-[15px] text-zinc-800 dark:text-slate-100">
                            {{ method.label }}
                        </span>
                    </div>
                    <LButton
                        :variant="method.linked ? 'tertiary' : 'secondary'"
                        size="sm"
                        @click="$emit('toggleMethod', method.id)"
                    >
                        {{ method.linked ? c("auth.settings.unlink") : c("auth.settings.link") }}
                    </LButton>
                </li>
            </ul>
        </section>

        <section
            v-if="sessions.length"
            class="rounded-lg border border-zinc-100 bg-white p-4 shadow dark:border-slate-800 dark:bg-slate-800"
        >
            <h2 class="text-sm font-semibold text-zinc-500 dark:text-slate-400">
                {{ c("auth.settings.sessions_section") }}
            </h2>
            <ul class="mt-2 divide-y divide-zinc-100 dark:divide-slate-700">
                <li
                    v-for="session in sessions"
                    :key="session.id"
                    class="flex items-center gap-3 py-3"
                >
                    <component
                        :is="
                            session.device.includes('iPhone') || session.device.includes('Android')
                                ? DevicePhoneMobileIcon
                                : ComputerDesktopIcon
                        "
                        class="h-5 w-5 shrink-0 text-zinc-400 dark:text-slate-400"
                    />
                    <div class="flex min-w-0 flex-col">
                        <span class="truncate text-[15px] text-zinc-800 dark:text-slate-100">
                            {{ session.device }}
                            <span
                                v-if="session.current"
                                class="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-300"
                            >
                                {{ c("auth.settings.this_device") }}
                            </span>
                        </span>
                        <span class="truncate text-sm text-zinc-500 dark:text-slate-400">
                            {{ [session.location, session.lastSeen].filter(Boolean).join(" · ") }}
                        </span>
                    </div>
                </li>
            </ul>
            <LButton
                variant="secondary"
                size="sm"
                class="mt-3 w-full"
                @click="$emit('signOutOthers')"
            >
                {{ c("auth.settings.sign_out_others") }}
            </LButton>
        </section>

        <button
            v-if="canDelete"
            type="button"
            class="self-start text-sm text-red-600 underline underline-offset-2 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            @click="$emit('deleteAccount')"
        >
            {{ c("auth.settings.delete") }}
        </button>
    </div>
</template>
