<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { type ContentParentDto } from "luminary-shared";
import LSelect from "../forms/LSelect.vue";
import MediaNotice from "./MediaNotice.vue";
import { storageSelection } from "@/composables/storageSelection";
import { capitaliseFirstLetter } from "@/util/string";

/**
 * Which bucket this document's media lives in.
 *
 * Leads the section because it decides where an encode is written, and the
 * encoder cannot be told to start without one.
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

const effectiveMediaBucketId = computed(() =>
    bucketSelection.effectiveMediaBucketId(parent.value?.mediaBucketId),
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

const NO_BUCKETS =
    "No storage buckets are configured. Add an S3 bucket in Storage settings before encoding media.";
const NO_SELECTION = "Choose a storage bucket before encoding media.";

// Surface bucket problems as soon as they exist rather than when an encode is
// attempted: the encoder cannot be told where to write without one.
const problem = computed(() => {
    if (!bucketSelection.hasMediaBuckets.value) return NO_BUCKETS;
    if (!effectiveMediaBucketId.value && bucketSelection.mediaBuckets.value.length > 1)
        return NO_SELECTION;
    return undefined;
});

// A bucket that no longer exists is not a selection. Checked only once buckets have
// loaded, or a slow IndexedDB read would clear a perfectly good one.
watchEffect(() => {
    if (!parent.value?.mediaBucketId || bucketSelection.mediaBuckets.value.length == 0) return;

    const stillExists = bucketSelection.mediaBuckets.value.some(
        (b) => b._id === parent.value?.mediaBucketId,
    );
    if (!stillExists) parent.value.mediaBucketId = undefined;
});
</script>

<template>
    <div class="flex flex-col gap-2">
        <LSelect
            v-if="bucketSelection.mediaBuckets.value.length > 1"
            :modelValue="effectiveMediaBucketId"
            @update:modelValue="handleBucketChange"
            :options="bucketOptions"
            :disabled="disabled"
            label="Storage bucket"
            data-test="bucket-select"
        />

        <p
            v-else-if="effectiveMediaBucketId"
            class="text-xs text-zinc-500"
            data-test="bucket-single"
        >
            Encoding into
            <span class="font-medium text-zinc-700">{{ bucketOptions[0]?.label }}</span
            >.
        </p>

        <MediaNotice v-if="problem" state="warning" data-test="bucket-problem">
            {{ problem }}
        </MediaNotice>
    </div>
</template>
