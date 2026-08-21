<script setup lang="ts">
import { type ContentParentDto, type DocType, type PostType, type TagType } from "luminary-shared";
import LCard from "../common/LCard.vue";
import { QuestionMarkCircleIcon, FilmIcon } from "@heroicons/vue/24/outline";
import { ref } from "vue";
import MediaEditor from "../media/MediaEditor.vue";
import EncodeMediaButton from "../media/EncodeMediaButton.vue";

type Props = {
    docType: DocType;
    tagOrPostType: TagType | PostType;
    disabled: boolean;
    newDocument?: boolean;
    embedded?: boolean;
    /** Shown in the encoder's session list so the editor can tell encodes apart. */
    title?: string;
};
const props = withDefaults(defineProps<Props>(), {
    embedded: false,
});

const parent = defineModel<ContentParentDto>("parent");
const showHelp = ref(false);

/**
 * The encoder publishes its URL when encoding *starts*, so this lands well before
 * the output exists. Written straight onto the document: the editor's normal save
 * persists it, and the app's coming-soon state covers the gap until the first
 * segments are in the bucket.
 */
const handleEncodedMedia = (media: { hlsUrl?: string; hlsKey?: string }) => {
    if (!parent.value) return;

    parent.value.media = {
        ...(parent.value.media ?? { fileCollections: [] }),
        hlsUrl: media.hlsUrl,
        hlsKey: media.hlsKey,
    };
};

/** Records the bucket the encode was sent to, when it was auto-selected rather than picked. */
const handleEncoderBucket = (bucketId: string) => {
    if (parent.value) parent.value.mediaBucketId = bucketId;
};
</script>

<template>
    <div v-if="parent">
        <LCard
            v-if="!props.embedded"
            title="Media"
            :icon="FilmIcon"
            :collapsed="newDocument ? false : true"
            collapsible
            class="bg-white"
        >
            <template #actions>
                <EncodeMediaButton
                    :documentId="parent._id"
                    :mediaBucketId="parent.mediaBucketId"
                    :title="props.title"
                    :disabled="disabled"
                    @media-ready="handleEncodedMedia"
                    @bucket-selected="handleEncoderBucket"
                />
                <button
                    class="flex cursor-pointer items-center gap-1 rounded-md"
                    @click.stop="showHelp = !showHelp"
                >
                    <QuestionMarkCircleIcon class="h-5 w-5" />
                </button>
            </template>
            <div v-if="showHelp">
                <p class="mb-2 text-xs">
                    Video and audio are produced by Luminary Media Convert. Use Encode to open it,
                    pick a file, and the encoded playlist is saved back to this document.
                </p>
            </div>
            <MediaEditor :disabled="disabled" v-model:parent="parent" class="scrollbar-hide" />
        </LCard>

        <div v-else>
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                    <FilmIcon class="h-5 w-5 text-zinc-400" />
                    <h3 class="text-sm font-medium leading-6 text-zinc-900">Media</h3>
                </div>
                <div class="flex items-center gap-2">
                    <EncodeMediaButton
                        :documentId="parent._id"
                        :mediaBucketId="parent.mediaBucketId"
                        :title="props.title"
                        :disabled="disabled"
                        @media-ready="handleEncodedMedia"
                        @bucket-selected="handleEncoderBucket"
                    />
                    <button
                        class="flex cursor-pointer items-center gap-1 rounded-md"
                        @click.stop="showHelp = !showHelp"
                        aria-label="Media help"
                        type="button"
                    >
                        <QuestionMarkCircleIcon class="h-5 w-5" />
                    </button>
                </div>
            </div>

            <div v-if="showHelp" class="mt-2">
                <p class="mb-2 text-xs">
                    Video and audio are produced by Luminary Media Convert. Use Encode to open it,
                    pick a file, and the encoded playlist is saved back to this document.
                </p>
            </div>

            <div class="mt-2">
                <MediaEditor :disabled="disabled" v-model:parent="parent" class="scrollbar-hide" />
            </div>
        </div>
    </div>
</template>
