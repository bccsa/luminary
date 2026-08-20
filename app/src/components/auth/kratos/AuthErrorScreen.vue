<script setup lang="ts">
import { ClockIcon, ExclamationTriangleIcon, SignalSlashIcon } from "@heroicons/vue/24/outline";
import LButton from "@/components/button/LButton.vue";
import AuthShell from "./AuthShell.vue";
import { useAuthCopy } from "./useAuthCopy";

type Props = {
    /** `expired` is the flow-expiry case Kratos returns most often; `offline` never reaches Kratos at all. */
    kind?: "generic" | "expired" | "offline";
    detail?: string;
    /** Kratos error id, so a user can quote it to support without us logging their address. */
    errorId?: string;
};
const props = withDefaults(defineProps<Props>(), { kind: "generic" });
defineEmits<{ restart: []; back: [] }>();

const c = useAuthCopy();
const icons = { generic: ExclamationTriangleIcon, expired: ClockIcon, offline: SignalSlashIcon };
const title = () =>
    props.kind === "expired"
        ? c("auth.error.expired_title")
        : props.kind === "offline"
          ? c("auth.error.offline_title")
          : c("auth.error.title");
const body = () =>
    props.kind === "expired"
        ? c("auth.error.expired_body")
        : props.kind === "offline"
          ? c("auth.error.offline_body")
          : props.detail;
</script>

<template>
    <AuthShell
        :title="title()"
        :subtitle="body()"
    >
        <template #brand>
            <span
                class="flex size-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-slate-700"
            >
                <component
                    :is="icons[props.kind]"
                    class="h-6 w-6 text-zinc-500 dark:text-slate-300"
                />
            </span>
        </template>

        <LButton
            v-if="kind !== 'offline'"
            variant="primary"
            size="xl"
            class="w-full"
            @click="$emit('restart')"
        >
            {{ c("auth.error.restart") }}
        </LButton>
        <LButton
            variant="secondary"
            size="xl"
            class="w-full"
            @click="$emit('back')"
        >
            {{ c("auth.error.back") }}
        </LButton>

        <template
            v-if="errorId"
            #footer
        >
            <p class="text-center text-xs tabular-nums text-zinc-400 dark:text-slate-500">
                {{ c("auth.error.reference", { id: errorId }) }}
            </p>
        </template>
    </AuthShell>
</template>
