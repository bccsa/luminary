<script setup lang="ts">
/**
 * Plays the video an editor has just pointed a document at.
 *
 * The URL and key fields say what *should* play; nothing said whether it does.
 * An encoded collection can carry a wrong key, a path that 404s, or angles that
 * never made it to the bucket, and every one of those looks identical in a text
 * input — the editor finds out when a reader does.
 *
 * The same player the app uses, so what an editor checks here is what a viewer
 * gets, rather than a second implementation that agrees right up until it does
 * not.
 */
import { computed, ref, watch } from "vue";
import LButton from "@/components/button/LButton.vue";
import LDialog from "@/components/common/LDialog.vue";
import { PlayCircleIcon } from "@heroicons/vue/24/outline";
import { LuminaryPlayer, type PlayerSource } from "@luminary-media-converter/player-web-legacy";
import { type ContentParentDto, SidecarType, getRest, unmaskKeyHex } from "luminary-shared";
import { storageSelection } from "@/composables/storageSelection";
import { toAbsoluteMediaUrl } from "@/util/mediaUrl";

type Props = {
    parent: ContentParentDto | undefined;
};
const props = defineProps<Props>();

const { getBucketById } = storageSelection();

/**
 * The URL to play.
 *
 * Stored relative to the bucket, so it is resolved the same way the app resolves
 * it — through the bucket's public URL. A collection hosted elsewhere is already
 * absolute and passes through untouched.
 */
const masterUrl = computed(() => {
    const url = props.parent?.media?.hlsUrl;
    if (!url) return undefined;
    const bucket = getBucketById(props.parent?.mediaBucketId ?? null);
    return toAbsoluteMediaUrl(url, bucket?.publicUrl);
});

/**
 * The key, as the player needs it.
 *
 * An unsaved key is in hand and is used directly — that is the whole point of
 * previewing before saving. A saved one is never readable again from the
 * document, so it is fetched; the server hands it to an editor who may see the
 * document.
 */
const storedKey = ref<string | undefined>(undefined);

watch(
    () => [props.parent?._id, props.parent?.media?.hlsKey_id] as const,
    async ([id, keyId]) => {
        storedKey.value = undefined;
        if (!id || !keyId) return;
        const sidecar = await getRest().getSidecar(id, SidecarType.HlsEncryptionKey, { cms: true });
        if (!sidecar) return;
        const data = sidecar.data as { maskedKeyHex: string } | undefined;
        if (!data?.maskedKeyHex) return;
        storedKey.value = await unmaskKeyHex(sidecar.sidecarId, data.maskedKeyHex);
    },
    { immediate: true },
);

const keyHex = computed(() => props.parent?.media?.hlsKey || storedKey.value);

const source = computed<PlayerSource | null>(() =>
    masterUrl.value ? { masterUrl: masterUrl.value, keyHex: keyHex.value } : null,
);

/**
 * Loaded on request rather than on sight, and in a dialog rather than in the form.
 *
 * Opening a document should not start fetching segments from a bucket — an
 * editor opens many and previews few, and a preview that plays itself is a
 * surprise in a form. The dialog also gives the picture room the edit column does
 * not have, and unmounts the player on close, so closing actually stops it.
 */
const showing = ref(false);

// A different document, or a different collection on the same one, is a
// different thing to check.
watch(masterUrl, () => (showing.value = false));
</script>

<template>
    <div v-if="source" data-test="video-preview">
        <LButton
            variant="secondary"
            size="sm"
            :icon="PlayCircleIcon"
            data-test="video-preview-load"
            @click="showing = true"
        >
            Preview video
        </LButton>

        <LDialog
            v-model:open="showing"
            title="Preview video"
            largeModal
            :primaryAction="() => (showing = false)"
            primaryButtonText="Close"
        >
            <div class="overflow-hidden rounded-md bg-black">
                <LuminaryPlayer
                    v-if="showing"
                    :source="source"
                    :controls="{ subtitlesMenu: false }"
                    data-test="video-preview-player"
                />
            </div>
        </LDialog>
    </div>
</template>
