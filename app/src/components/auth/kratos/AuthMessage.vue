<script setup lang="ts">
import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
} from "@heroicons/vue/24/outline";

/** Mirrors Kratos `ui.messages[].type`, so a flow's messages render without translation at the call site. */
type Props = { type?: "info" | "error" | "success"; text: string };
const props = withDefaults(defineProps<Props>(), { type: "info" });

const styles = {
    info: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-200",
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
    success:
        "border-green-200 bg-green-50 text-green-800 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-200",
};
const icons = {
    info: InformationCircleIcon,
    error: ExclamationTriangleIcon,
    success: CheckCircleIcon,
};
</script>

<template>
    <div
        class="flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm"
        :class="styles[props.type]"
        :role="props.type === 'error' ? 'alert' : 'status'"
    >
        <component
            :is="icons[props.type]"
            class="mt-0.5 h-5 w-5 shrink-0"
        />
        <span>{{ text }}</span>
    </div>
</template>
