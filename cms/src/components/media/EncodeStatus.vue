<script setup lang="ts">
import { computed } from "vue";
import MediaNotice from "./MediaNotice.vue";
import { ENCODER_DOWNLOAD_URL, ENCODER_PROTOCOL_URL } from "@/util/mediaEncoder";
import type { EncoderAvailability } from "@/composables/useMediaEncoder";

/**
 * What the encoder is doing, and why it cannot be reached when it cannot.
 *
 * Kept apart from the button so progress has the width of the section rather
 * than the space beside a control in a card header — an encode runs for minutes
 * and a percentage squeezed next to a button reads as an afterthought.
 */
type Props = {
    availability: EncoderAvailability;
    /** Running, but older than this CMS knows how to talk to. */
    outdated?: boolean;
    status?: string;
    progress?: number;
    error?: string;
};
const props = defineProps<Props>();

/** The encoder's session statuses, in the words an editor should see. */
const STATUS_LABELS: Record<string, string> = {
    created: "Preparing",
    uploading: "Reading file",
    uploaded: "Ready",
    queued: "Queued",
    encoding: "Encoding",
    encrypting: "Encrypting",
    uploading_to_s3: "Uploading",
    completed: "Encoded",
    failed: "Failed",
};

const running = computed(() => props.status == "encoding" || props.status == "uploading_to_s3");

const label = computed(() => (props.status ? (STATUS_LABELS[props.status] ?? props.status) : ""));

/** Only meaningful while something is running — "Encoded 100%" says it twice. */
// One decimal: the encoder reports a raw float, so a bar labelled
// "Encoding 1.7666666666666668%" is arithmetic rather than progress. Number()
// drops a trailing .0, so a whole percentage still reads as one.
const percentage = computed(() =>
    running.value && props.progress != undefined ? Number(props.progress.toFixed(1)) : undefined,
);
</script>

<template>
    <div
        v-if="error || status || outdated || availability != 'available'"
        class="flex flex-col gap-2 py-1"
    >
        <div v-if="status" data-test="encoder-status">
            <div v-if="percentage != undefined" class="flex items-center gap-2">
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <div
                        class="h-full rounded-full bg-zinc-700 transition-[width] duration-500"
                        :style="{ width: `${percentage}%` }"
                        data-test="encoder-progress-bar"
                    />
                </div>
                <span class="whitespace-nowrap text-xs font-medium tabular-nums text-zinc-700">
                    {{ label }} {{ percentage }}%
                </span>
            </div>
            <span v-else class="text-xs font-medium text-zinc-700">{{ label }}</span>

            <p v-if="running" class="mt-1 text-xs text-zinc-500" data-test="encoder-leave-hint">
                You can save and come back — this keeps running.
            </p>
        </div>

        <MediaNotice v-if="error" state="error" data-test="encoder-error">
            {{ error }}
        </MediaNotice>

        <!-- Outdated outranks the availability notices: the encoder answered, so
             "not running" would be wrong, and encoding with it may fail anyway. -->
        <MediaNotice v-else-if="outdated" state="warning" data-test="encoder-outdated">
            Your Luminary Media Convert is outdated and may no longer work with this site.
            <a
                :href="ENCODER_DOWNLOAD_URL"
                target="_blank"
                rel="noopener"
                class="font-medium underline underline-offset-2 hover:text-yellow-900"
                data-test="encoder-download"
                >Download the current version</a
            >, then install it over the old one.
        </MediaNotice>

        <!--
            Chrome is the browser this is known to work in; whether the others
            genuinely cannot reach the encoder is unverified (#1979), so the
            first thing to ask is whether the app is running at all.
        -->
        <MediaNotice
            v-else-if="availability == 'browser-unsupported'"
            state="warning"
            data-test="encoder-browser-unsupported"
        >
            Luminary Media Convert did not answer.
            <a
                :href="ENCODER_PROTOCOL_URL"
                class="font-medium underline underline-offset-2 hover:text-yellow-900"
                data-test="encoder-launch"
                >Open it</a
            >
            — this updates on its own once it is. If it is already open, try this page in Chrome;
            that is the browser this is known to work in. Never installed it?
            <a
                :href="ENCODER_DOWNLOAD_URL"
                target="_blank"
                rel="noopener"
                class="font-medium underline underline-offset-2 hover:text-yellow-900"
                data-test="encoder-download"
                >Download it</a
            >.
        </MediaNotice>

        <MediaNotice
            v-else-if="availability == 'unavailable'"
            state="info"
            data-test="encoder-unavailable"
        >
            Luminary Media Convert is not running.
            <a
                :href="ENCODER_PROTOCOL_URL"
                class="font-medium underline underline-offset-2 hover:text-zinc-900"
                data-test="encoder-launch"
                >Open it</a
            >
            — this updates on its own once it is — or
            <a
                :href="ENCODER_DOWNLOAD_URL"
                target="_blank"
                rel="noopener"
                class="font-medium underline underline-offset-2 hover:text-zinc-900"
                data-test="encoder-download"
                >download it</a
            >
            if it is not installed yet.
        </MediaNotice>
    </div>
</template>
