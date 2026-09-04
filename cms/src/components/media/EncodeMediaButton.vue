<script setup lang="ts">
import { computed } from "vue";
import { FilmIcon } from "@heroicons/vue/24/outline";
import LButton from "../button/LButton.vue";
import type { EncoderAvailability } from "@/composables/useMediaEncoder";

/**
 * The control that starts an encode.
 *
 * Purely the button: whether the encoder is reachable, what it is doing, and why
 * it is not are all explained in the section body by EncodeStatus, so this stays
 * one control in one place instead of swapping between a button, a link and a
 * notice depending on state.
 */
type Props = {
    availability: EncoderAvailability;
    busy: boolean;
    documentId?: string;
    hasBucket?: boolean;
    disabled?: boolean;
};
const props = defineProps<Props>();

const emit = defineEmits<{ encode: [] }>();

/**
 * Why the button is unavailable, or empty when it is ready. Surfaced as a tooltip:
 * a control that is disabled for five different reasons and explains none of them
 * is a support question every time.
 */
const disabledReason = computed(() => {
    if (props.disabled) return "You do not have permission to edit this document.";
    if (!props.documentId) return "Save the document before encoding media for it.";
    if (!props.hasBucket) return "No media storage bucket is configured for this document.";
    if (props.availability == "checking") return "Looking for Luminary Media Convert…";
    if (props.availability == "browser-unsupported")
        return "Luminary Media Convert did not answer. Open it, or try this page in Chrome.";
    if (props.availability != "available") return "Luminary Media Convert is not running.";
    if (props.busy) return "Starting an encoding session…";
    return "";
});
</script>

<template>
    <LButton
        :icon="FilmIcon"
        size="base"
        :disabled="Boolean(disabledReason)"
        :title="disabledReason || 'Encode video with Luminary Media Convert'"
        @click.stop="emit('encode')"
        data-test="encode-media-button"
    >
        <span class="block sm:hidden">Encode video</span>
        <span class="hidden text-sm sm:inline">Encode</span>
    </LButton>
</template>
