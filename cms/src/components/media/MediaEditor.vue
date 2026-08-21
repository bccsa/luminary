<script setup lang="ts">
import {
    type ContentParentDto,
    type LanguageDto,
    DocType,
    useSharedHybridQuery,
} from "luminary-shared";
import { computed, ref, watchEffect } from "vue";
import { ExclamationCircleIcon } from "@heroicons/vue/24/solid";
import MediaEditorThumbnail from "./MediaEditorThumbnail.vue";
import LSelect from "../forms/LSelect.vue";
import { storageSelection } from "@/composables/storageSelection";
import { capitaliseFirstLetter } from "@/util/string";

/**
 * Media on a content parent: which bucket it lives in, and whatever audio was
 * uploaded to it before.
 *
 * Uploading through the CMS is gone — media is produced by Luminary Media Convert,
 * which writes to the bucket itself. Existing audio stays listed and playable
 * because documents still carry it and the app still plays it; there is simply no
 * way to add more from here.
 */
type Props = {
    disabled: boolean;
};
defineProps<Props>();

const emit = defineEmits<{
    bucketSelected: [bucketId: string];
}>();

const parent = defineModel<ContentParentDto>("parent");

const bucketSelection = storageSelection();

// The bucket to treat as "current". Falls back to the auto-selected bucket when the
// parent has none persisted yet — so a single-bucket setup behaves as if it were
// selected without mutating the parent (which would create a fake dirty state on
// legacy docs). The parent is only written to when the user actually picks one.
const effectiveMediaBucketId = computed(
    () => parent.value?.mediaBucketId ?? bucketSelection.autoSelectMediaBucket.value ?? undefined,
);

const bucketOptions = computed(() =>
    bucketSelection.mediaBuckets.value.map((bucket) => ({
        id: bucket._id,
        label: capitaliseFirstLetter(bucket.name),
        value: bucket._id,
    })),
);

const handleBucketChange = (bucketId: string) => {
    if (parent.value) {
        parent.value.mediaBucketId = bucketId;
        emit("bucketSelected", bucketId);
    }
};

const allLanguages = useSharedHybridQuery<LanguageDto>(
    () => ({ selector: { type: DocType.Language } }),
    { live: true },
);

// Sorted by name, matching the CMS Language Modal.
const availableLanguages = computed(() =>
    [...allLanguages.value].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
);

const allFileCollections = computed(() => parent.value?.media?.fileCollections || []);
const hasMedia = computed(() => allFileCollections.value.length > 0);

const showFailureMessage = ref(false);
const failureMessage = ref<string | undefined>(undefined);

const NO_BUCKETS =
    "No storage buckets configured. Please configure at least one S3 bucket in the Storage settings before encoding media.";
const NO_SELECTION = "Please select a storage bucket before encoding media.";

// Surface bucket problems as soon as they exist rather than when an encode is
// attempted: the encoder cannot be told where to write without one.
watchEffect(() => {
    // Only validate once buckets have loaded, or a slow IndexedDB read would clear
    // a perfectly good selection.
    if (parent.value?.mediaBucketId && bucketSelection.mediaBuckets.value.length > 0) {
        const stillExists = bucketSelection.mediaBuckets.value.some(
            (b) => b._id === parent.value?.mediaBucketId,
        );
        if (!stillExists) parent.value.mediaBucketId = undefined;
    }

    if (!bucketSelection.hasMediaBuckets.value) {
        failureMessage.value = NO_BUCKETS;
        showFailureMessage.value = true;
    } else if (!effectiveMediaBucketId.value && bucketSelection.mediaBuckets.value.length > 1) {
        failureMessage.value = NO_SELECTION;
        showFailureMessage.value = true;
    } else if (
        effectiveMediaBucketId.value &&
        failureMessage.value &&
        [NO_BUCKETS, NO_SELECTION].includes(failureMessage.value)
    ) {
        failureMessage.value = undefined;
        showFailureMessage.value = false;
    }
});
</script>

<template>
    <div class="flex flex-col overflow-x-auto">
        <div v-if="bucketSelection.mediaBuckets.value.length > 1" class="mb-2 px-0.5 pt-1">
            <LSelect
                :modelValue="effectiveMediaBucketId"
                @update:modelValue="handleBucketChange"
                :options="bucketOptions"
                :disabled="disabled"
                label="Storage bucket"
                data-test="bucket-select"
            />
        </div>

        <div :disabled="disabled" class="flex justify-between">
            <div class="flex gap-1">
                <button
                    v-if="failureMessage"
                    @click="showFailureMessage = !showFailureMessage"
                    type="button"
                    data-test="failure-message-toggle"
                >
                    <ExclamationCircleIcon class="h-5 w-5 text-red-600" />
                </button>
            </div>
        </div>
        <div v-if="showFailureMessage && failureMessage">
            <p class="my-2 text-xs text-red-600" data-test="failure-message">
                {{ failureMessage }}
            </p>
        </div>

        <div v-if="hasMedia" class="scrollbar-hide">
            <div class="flex flex-col gap-2 py-2" data-test="thumbnail-area">
                <div
                    v-for="language in availableLanguages.filter((l) =>
                        allFileCollections.some((c) => c.languageId === l._id),
                    )"
                    :key="language._id"
                >
                    <div class="flex gap-2">
                        <div
                            v-for="c in allFileCollections.filter(
                                (c) => c.languageId === language._id,
                            )"
                            :key="c.fileUrl"
                        >
                            <MediaEditorThumbnail
                                :mediaFile="c"
                                :disabled="disabled"
                                :languageCode="language.languageCode"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div v-else class="my-4 text-center italic">
            <p class="text-sm text-zinc-500" data-test="no-media-message">No audio files.</p>
        </div>
    </div>
</template>
