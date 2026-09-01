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
import LModal from "@/components/modals/LModal.vue";
import LBadge from "@/components/common/LBadge.vue";
import { PlayCircleIcon } from "@heroicons/vue/24/outline";
import { LockClosedIcon, LockOpenIcon } from "@heroicons/vue/16/solid";
import { LuminaryPlayer, type PlayerSource } from "@luminary-media-converter/player-web-legacy";
import { type ContentParentDto, SidecarType, getRest, unmaskKeyHex } from "luminary-shared";
import { storageSelection } from "@/composables/storageSelection";
import { toAbsoluteMediaUrl } from "@/util/mediaUrl";

type Props = {
    parent: ContentParentDto | undefined;
    /** The encode in flight, so "nothing here yet" can say how long is left. */
    encodeStatus?: string;
    encodeProgress?: number;
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
 * What a failure means to the person who can fix it.
 *
 * The player types its failures, and the codes map onto exactly the mistakes this
 * preview exists to catch. Its own panel is written for a reader, who can do
 * nothing about any of them.
 */
const DIAGNOSES: Record<string, { what: string; fix: string }> = {
    "key-required": {
        what: "This collection is encrypted and no key was given.",
        fix: "Add the encryption key above, or re-encode to generate one.",
    },
    "decrypt-failed": {
        what: "The key does not match this collection.",
        fix: "Check the key above. Media encoded with a different key cannot be recovered.",
    },
    "fetch-failed": {
        what: "Part of the collection is missing from the bucket.",
        fix: "If the encode is still running, the segments may not be uploaded yet.",
    },
    "invalid-content": {
        what: "This URL does not return a playlist.",
        fix: "Check it points at the collection's master.m3u8.",
    },
    "unsupported-browser": {
        what: "This browser cannot play the collection.",
        fix: "Chrome plays every collection the app does.",
    },
};

const diagnose = (code?: string) =>
    (code && DIAGNOSES[code]) || {
        what: "The collection could not be played.",
        fix: "Check the URL and the bucket's CORS rules allow the Range header.",
    };

/** How far along the encode is, when one is running for this document. */
const encodeNote = computed(() => {
    if (!props.encodeStatus || props.encodeStatus == "completed") return undefined;
    if (props.encodeStatus == "failed") return "The encode failed.";

    return props.encodeProgress != undefined
        ? `Encoding is at ${props.encodeProgress}%.`
        : "The encode is still running.";
});

/**
 * Where the key being used came from.
 *
 * A key typed into the form and one fetched from the sidecar fail in different
 * ways and look identical in the player, so the dialog says which is in play.
 */
const keySource = computed(() => {
    if (props.parent?.media?.hlsKey) return "unsaved";
    if (storedKey.value) return "saved";
    return undefined;
});

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
    <div v-if="source" class="py-2" data-test="video-preview">
        <LButton
            variant="secondary"
            size="sm"
            :icon="PlayCircleIcon"
            data-test="video-preview-load"
            @click="showing = true"
        >
            Preview video
        </LButton>

        <LModal
            v-model:isVisible="showing"
            heading="Preview video"
            noDivider
            wide
            preventBackdropClose
        >
            <!--
                Whether the collection is encrypted decides how it can fail, so it
                belongs where it is read before pressing play rather than under it.
            -->
            <template #rightHeading>
                <LBadge
                    :variant="keySource ? 'default' : 'warning'"
                    :icon="keySource ? LockClosedIcon : LockOpenIcon"
                    withIcon
                    :title="
                        keySource == 'unsaved'
                            ? 'Playing the key entered above, not yet saved'
                            : keySource == 'saved'
                              ? 'Playing the key saved for this video'
                              : 'This collection is not encrypted'
                    "
                    data-test="preview-encryption"
                >
                    {{ keySource ? "Encrypted" : "Not encrypted" }}
                </LBadge>
            </template>

            <div class="overflow-hidden rounded-md bg-black">
                <LuminaryPlayer
                    v-if="showing"
                    :source="source"
                    :controls="{ subtitlesMenu: false }"
                    data-test="video-preview-player"
                >
                    <!--
                        The player's own panels speak to a reader, who cannot act on
                        any of this. These speak to the person who can.
                    -->
                    <template #coming-soon>
                        <div class="lmpl-panel" data-test="preview-not-yet">
                            <p class="text-sm font-medium text-white">Nothing at this URL yet.</p>
                            <p class="mt-1 max-w-sm text-xs text-zinc-300">
                                {{
                                    encodeNote ??
                                    "The playlist has not been published to the bucket."
                                }}
                                Checking again automatically.
                            </p>
                        </div>
                    </template>

                    <template #error="{ error, retry }">
                        <div class="lmpl-panel" data-test="preview-error">
                            <p class="text-sm font-medium text-white">
                                {{ diagnose(error?.code).what }}
                            </p>
                            <p class="mt-1 max-w-sm text-xs text-zinc-300">
                                {{ diagnose(error?.code).fix }}
                            </p>
                            <button
                                type="button"
                                class="mt-3 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                                data-test="preview-retry"
                                @click="retry"
                            >
                                Try again
                            </button>
                            <p
                                v-if="error?.code"
                                class="mt-2 font-mono text-[11px] text-zinc-500"
                                data-test="preview-error-code"
                            >
                                {{ error.code }}
                            </p>
                        </div>
                    </template>
                </LuminaryPlayer>
            </div>
        </LModal>
    </div>
</template>
