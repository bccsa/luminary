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
import { PlayCircleIcon } from "@heroicons/vue/24/outline";
import { LockClosedIcon, LockOpenIcon, ClipboardIcon, CheckIcon } from "@heroicons/vue/20/solid";
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

/** The bucket the relative URL was resolved through, for the footer to name. */
const bucketName = computed(() => getBucketById(props.parent?.mediaBucketId ?? null)?.name);

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

const copied = ref(false);

/**
 * The URL is the answer to the question a failed preview always raises, and it is
 * composed rather than stored — so it cannot be copied out of the form above.
 */
const copyUrl = async () => {
    if (!masterUrl.value) return;
    try {
        await navigator.clipboard.writeText(masterUrl.value);
        copied.value = true;
        setTimeout(() => (copied.value = false), 2000);
    } catch {
        /* a browser refusing the clipboard is not worth an error state here */
    }
};

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
watch(masterUrl, () => {
    showing.value = false;
    copied.value = false;
});
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
            <div class="overflow-hidden rounded-md bg-black">
                <LuminaryPlayer
                    v-if="showing"
                    :source="source"
                    :controls="{ subtitlesMenu: false }"
                    data-test="video-preview-player"
                />
            </div>

            <!--
                What is actually being played. The URL is composed from the bucket's
                public URL rather than stored, so it is the one thing a broken
                preview turns on and the one thing the form above cannot show.
            -->
            <template #footer>
                <div class="flex flex-col gap-1.5 text-xs text-zinc-500">
                    <div class="flex items-center gap-1.5" data-test="preview-encryption">
                        <component
                            :is="keySource ? LockClosedIcon : LockOpenIcon"
                            class="h-3.5 w-3.5 shrink-0"
                        />
                        <span v-if="keySource == 'unsaved'">
                            Encrypted — playing the key entered above, not yet saved
                        </span>
                        <span v-else-if="keySource == 'saved'">
                            Encrypted — playing the key saved for this video
                        </span>
                        <span v-else>Not encrypted</span>
                    </div>

                    <div class="flex items-center gap-2">
                        <span class="truncate font-mono" :title="masterUrl" data-test="preview-url">
                            {{ masterUrl }}
                        </span>
                        <button
                            type="button"
                            class="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                            data-test="preview-copy-url"
                            @click="copyUrl"
                        >
                            <component
                                :is="copied ? CheckIcon : ClipboardIcon"
                                class="h-3.5 w-3.5"
                            />
                            {{ copied ? "Copied" : "Copy" }}
                        </button>
                    </div>

                    <p v-if="bucketName" data-test="preview-bucket">via {{ bucketName }}</p>
                </div>
            </template>
        </LModal>
    </div>
</template>
