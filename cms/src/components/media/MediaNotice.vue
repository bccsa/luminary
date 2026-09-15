<script setup lang="ts">
import { computed } from "vue";
import {
    InformationCircleIcon,
    ExclamationTriangleIcon,
    XCircleIcon,
} from "@heroicons/vue/20/solid";

/**
 * One shape for everything the media section has to tell an editor.
 *
 * The same kind of information reached them three different ways before: an icon
 * that toggled text open, a truncated line whose full message lived in a title
 * attribute, and a coloured paragraph. Colour carries the severity here, and the
 * text is always readable.
 */
type Props = {
    state?: "info" | "warning" | "error";
};
const props = withDefaults(defineProps<Props>(), { state: "info" });

const icon = computed(
    () =>
        ({
            info: InformationCircleIcon,
            warning: ExclamationTriangleIcon,
            error: XCircleIcon,
        })[props.state],
);

const tone = computed(
    () =>
        ({
            info: "border-zinc-200 bg-zinc-50 text-zinc-600",
            warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
            error: "border-red-200 bg-red-50 text-red-700",
        })[props.state],
);
</script>

<template>
    <div
        class="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
        :class="tone"
        data-test="media-notice"
    >
        <component :is="icon" class="mt-0.5 h-4 w-4 shrink-0" />
        <span class="min-w-0"><slot /></span>
    </div>
</template>
