<script setup lang="ts">
import LCard from "@/components/common/LCard.vue";
import LInput from "@/components/forms/LInput.vue";
import { VideoCameraIcon, LinkIcon, KeyIcon } from "@heroicons/vue/20/solid";
import { type ContentParentDto } from "luminary-shared";
import { computed, ref, watch } from "vue";

/**
 * The video for a content parent: an HLS playlist URL and, when the collection is
 * encrypted, its AES key.
 *
 * Both live on `media`, which is where the encoder writes them — so a hand-entered
 * collection and an encoded one are the same thing to everything downstream, and
 * there is no second field that can quietly disagree.
 */
type Props = {
    disabled: boolean;
    /** Render as a plain section (no card chrome / collapse) for nesting in another card. */
    bare?: boolean;
};
defineProps<Props>();

const parent = defineModel<ContentParentDto>("parent");

const collapsed = ref(false);
const hasInitialized = ref(false);

/** Writes go through `media`, which may not exist yet on an untouched document. */
function media() {
    if (!parent.value) return undefined;
    if (!parent.value.media) parent.value.media = { fileCollections: [] };
    return parent.value.media;
}

const hlsUrl = computed({
    get: () => parent.value?.media?.hlsUrl,
    set: (value) => {
        const m = media();
        if (m) m.hlsUrl = value;
    },
});

const hlsKey = computed({
    get: () => parent.value?.media?.hlsKey,
    set: (value) => {
        const m = media();
        if (m) m.hlsKey = value || undefined;
    },
});

/**
 * A stored key is only ever a reference: the API encrypts the submitted key into a
 * crypto object on save and returns its id, so the key itself is never readable
 * again. The field therefore starts empty on a saved document, and saying so beats
 * an empty box that looks like no key at all.
 */
const hasStoredKey = computed(() => Boolean(parent.value?.media?.hlsKey_id));

/** The user has typed a replacement over a key that is already saved. */
const replacingKey = computed(() => Boolean(hlsKey.value));

// Collapse the card only initially if there's no video
watch(
    () => parent.value?.media?.hlsUrl,
    (url) => {
        if (!hasInitialized.value) {
            collapsed.value = url == null || url === "";
            hasInitialized.value = true;
        }
        // DO NOTHING after initial render
    },
    { immediate: true },
);
</script>

<template>
    <LCard
        v-if="parent"
        title="Video"
        :icon="VideoCameraIcon"
        :collapsible="!bare"
        :collapsed="bare ? false : collapsed"
        :bare="bare"
        data-test="videoContent"
        :class="bare ? '' : 'bg-white'"
    >
        <LInput
            name="video"
            v-model="hlsUrl"
            :icon="LinkIcon"
            placeholder="https://.../master.m3u8"
            :disabled="disabled"
            class="pb-1"
            data-test="video-url-input"
        />

        <LInput
            name="hlsKey"
            v-model="hlsKey"
            :icon="KeyIcon"
            :placeholder="
                hasStoredKey
                    ? 'A key is saved — type a new one to replace it'
                    : 'Encryption key (hex)'
            "
            :disabled="disabled"
            class="pb-1"
            data-test="video-key-input"
        />
        <p class="text-xs text-zinc-500" data-test="video-key-note">
            <template v-if="hasStoredKey">
                An encryption key is saved for this video. It cannot be shown again.
            </template>
            <template v-else>
                Only needed for an encrypted collection. Encoding fills this in for you.
            </template>
        </p>
        <!--
            Replacing a saved key is the one edit on this form that cannot be
            undone by retyping: the media was encrypted with the old key, and
            nothing keeps a copy of it. Warned at the moment of typing rather
            than on save, because by then the old key is already gone.
        -->
        <p
            v-if="hasStoredKey && replacingKey"
            class="text-xs font-medium text-amber-600 dark:text-amber-500"
            data-test="video-key-warning"
        >
            This replaces the saved key. Anything already encrypted with the old
            one becomes unplayable, and the old key cannot be recovered.
        </p>
    </LCard>
</template>
