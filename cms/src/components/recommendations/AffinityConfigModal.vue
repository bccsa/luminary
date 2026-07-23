<script setup lang="ts">
import { ref, watch } from "vue";
import {
    AckStatus,
    AclPermission,
    DocType,
    getAccessibleGroups,
    type AffinityConfig,
} from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import { useDefaultAffinity } from "@/composables/useDefaultAffinity";
import LButton from "@/components/button/LButton.vue";
import LModal from "@/components/modals/LModal.vue";
import LInput from "@/components/forms/LInput.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";

const isVisible = defineModel<boolean>("isVisible");
const isSaving = ref(false);
const { addNotification } = useNotificationStore();

const { current, config: savedConfig, saveConfig } = useDefaultAffinity();

/**
 * Plain-object clone of a (possibly Vue-reactive) config — `structuredClone` can throw on a
 * reactive Proxy in some environments, so build a fresh plain object field-by-field instead.
 */
function cloneConfig(config: AffinityConfig): AffinityConfig {
    return {
        tierHalfLifeDays: { ...config.tierHalfLifeDays },
        tierWeight: { ...config.tierWeight },
        hitWeight: config.hitWeight,
        minScore: config.minScore,
        maxTags: config.maxTags,
        depthScale: config.depthScale,
        readFloorPercent: config.readFloorPercent,
        eventWeight: { ...config.eventWeight },
    };
}

const form = ref<AffinityConfig>(cloneConfig(savedConfig.value));

function resetForm() {
    form.value = cloneConfig(savedConfig.value);
}

watch(isVisible, (visible) => {
    if (visible) resetForm();
});

watch(savedConfig, () => {
    if (isVisible.value) resetForm();
});

function clamp(value: number, min: number, max: number, fallback: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

/** Mirrors the server-side clamping in `processDefaultAffinityDto.ts` — defense in depth. */
function normalizedConfig(): AffinityConfig {
    const c = form.value;
    const tier = (
        source: Record<string, number>,
        fallback: Record<string, number>,
        min: number,
        max: number,
    ) =>
        Object.fromEntries(
            Object.keys(fallback).map((key) => [key, clamp(source[key], min, max, fallback[key])]),
        ) as AffinityConfig["tierHalfLifeDays"];

    return {
        tierHalfLifeDays: tier(c.tierHalfLifeDays, savedConfig.value.tierHalfLifeDays, 1, 3650),
        tierWeight: tier(c.tierWeight, savedConfig.value.tierWeight, 0, 2),
        hitWeight: clamp(c.hitWeight, 0, 1, savedConfig.value.hitWeight),
        minScore: clamp(c.minScore, 0.0001, 0.5, savedConfig.value.minScore),
        maxTags: Math.round(clamp(c.maxTags, 1, 500, savedConfig.value.maxTags)),
        depthScale: clamp(c.depthScale, 1, 1000, savedConfig.value.depthScale),
        readFloorPercent: clamp(c.readFloorPercent, 0, 100, savedConfig.value.readFloorPercent),
        eventWeight: {
            bookmark: clamp(c.eventWeight.bookmark, -1, 1, savedConfig.value.eventWeight.bookmark),
            bookmarkRemoved: clamp(
                c.eventWeight.bookmarkRemoved,
                -1,
                1,
                savedConfig.value.eventWeight.bookmarkRemoved,
            ),
            completion: clamp(c.eventWeight.completion, -1, 1, savedConfig.value.eventWeight.completion),
            readCompletion: clamp(
                c.eventWeight.readCompletion,
                -1,
                1,
                savedConfig.value.eventWeight.readCompletion,
            ),
            highlight: clamp(c.eventWeight.highlight, -1, 1, savedConfig.value.eventWeight.highlight),
            highlightRemoved: clamp(
                c.eventWeight.highlightRemoved,
                -1,
                1,
                savedConfig.value.eventWeight.highlightRemoved,
            ),
            impression: clamp(c.eventWeight.impression, -1, 1, savedConfig.value.eventWeight.impression),
        },
    };
}

function editableMemberOf(): string[] {
    if (current.value?.memberOf?.length) return [...current.value.memberOf];
    return getAccessibleGroups(AclPermission.Edit)[DocType.DefaultAffinity]?.slice(0, 1) ?? [];
}

async function save() {
    const memberOf = editableMemberOf();
    if (!memberOf.length) {
        addNotification({
            title: "Can't save these settings",
            description: "You don't have permission to edit this.",
            state: "error",
        });
        return;
    }

    isSaving.value = true;
    try {
        const res = await saveConfig(normalizedConfig(), memberOf);
        if (res && res.ack === AckStatus.Rejected) {
            addNotification({
                title: "Can't save these settings",
                description: res.message || "The server rejected the update.",
                state: "error",
            });
            return;
        }
        addNotification({
            title: "Settings saved",
            description: "These changes will apply the next time people open the app.",
            state: "success",
        });
        isVisible.value = false;
    } catch (error) {
        addNotification({
            title: "Can't save these settings",
            description: error instanceof Error ? error.message : "The change could not be saved.",
            state: "error",
        });
    } finally {
        isSaving.value = false;
    }
}
</script>

<template>
    <LModal v-model:is-visible="isVisible" heading="How recommendations adapt" largeModal>
        <div class="w-[min(42rem,calc(100vw-2rem))] space-y-6">
            <div class="text-sm text-zinc-600">
                Control how much attention different interests get, and how strongly each action
                shapes what people are shown next.
            </div>

            <fieldset class="space-y-3">
                <legend class="text-sm font-semibold text-zinc-900">
                    How long an interest lasts (days)
                </legend>
                <div class="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
                    <LInput
                        name="tierHalfLifeDays-core"
                        label="Top interests"
                        type="number"
                        step="1"
                        v-model="form.tierHalfLifeDays.core"
                        data-test="affinity-config-tierHalfLifeDays-core"
                    />
                    <LInput
                        name="tierHalfLifeDays-strong"
                        label="Strong interests"
                        type="number"
                        step="1"
                        v-model="form.tierHalfLifeDays.strong"
                        data-test="affinity-config-tierHalfLifeDays-strong"
                    />
                    <LInput
                        name="tierHalfLifeDays-established"
                        label="Growing interests"
                        type="number"
                        step="1"
                        v-model="form.tierHalfLifeDays.established"
                        data-test="affinity-config-tierHalfLifeDays-established"
                    />
                    <LInput
                        name="tierHalfLifeDays-unprotected"
                        label="Other interests"
                        type="number"
                        step="1"
                        v-model="form.tierHalfLifeDays.unprotected"
                        data-test="affinity-config-tierHalfLifeDays-unprotected"
                    />
                </div>
            </fieldset>

            <fieldset class="space-y-3">
                <legend class="text-sm font-semibold text-zinc-900">
                    How much each interest counts
                </legend>
                <div class="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
                    <LInput
                        name="tierWeight-core"
                        label="Top interests"
                        type="number"
                        step="0.05"
                        v-model="form.tierWeight.core"
                        data-test="affinity-config-tierWeight-core"
                    />
                    <LInput
                        name="tierWeight-strong"
                        label="Strong interests"
                        type="number"
                        step="0.05"
                        v-model="form.tierWeight.strong"
                        data-test="affinity-config-tierWeight-strong"
                    />
                    <LInput
                        name="tierWeight-established"
                        label="Growing interests"
                        type="number"
                        step="0.05"
                        v-model="form.tierWeight.established"
                        data-test="affinity-config-tierWeight-established"
                    />
                    <LInput
                        name="tierWeight-unprotected"
                        label="Other interests"
                        type="number"
                        step="0.05"
                        v-model="form.tierWeight.unprotected"
                        data-test="affinity-config-tierWeight-unprotected"
                    />
                </div>
            </fieldset>

            <fieldset class="space-y-3">
                <legend class="text-sm font-semibold text-zinc-900">
                    How much each action counts
                </legend>
                <div class="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
                    <LInput
                        name="hitWeight"
                        label="Viewing something"
                        type="number"
                        step="0.01"
                        v-model="form.hitWeight"
                        data-test="affinity-config-hitWeight"
                    />
                    <LInput
                        name="eventWeight-bookmark"
                        label="Saving/bookmarking"
                        type="number"
                        step="0.01"
                        v-model="form.eventWeight.bookmark"
                        data-test="affinity-config-eventWeight-bookmark"
                    />
                    <LInput
                        name="eventWeight-bookmarkRemoved"
                        label="Un-saving"
                        type="number"
                        step="0.01"
                        v-model="form.eventWeight.bookmarkRemoved"
                        data-test="affinity-config-eventWeight-bookmarkRemoved"
                    />
                    <LInput
                        name="eventWeight-completion"
                        label="Finishing a video/audio"
                        type="number"
                        step="0.01"
                        v-model="form.eventWeight.completion"
                        data-test="affinity-config-eventWeight-completion"
                    />
                    <LInput
                        name="eventWeight-readCompletion"
                        label="Finishing an article"
                        type="number"
                        step="0.01"
                        v-model="form.eventWeight.readCompletion"
                        data-test="affinity-config-eventWeight-readCompletion"
                    />
                    <LInput
                        name="eventWeight-highlight"
                        label="Highlighting text"
                        type="number"
                        step="0.01"
                        v-model="form.eventWeight.highlight"
                        data-test="affinity-config-eventWeight-highlight"
                    />
                    <LInput
                        name="eventWeight-highlightRemoved"
                        label="Removing a highlight"
                        type="number"
                        step="0.01"
                        v-model="form.eventWeight.highlightRemoved"
                        data-test="affinity-config-eventWeight-highlightRemoved"
                    />
                    <LInput
                        name="eventWeight-impression"
                        label="Scrolling past, unopened"
                        type="number"
                        step="0.01"
                        v-model="form.eventWeight.impression"
                        data-test="affinity-config-eventWeight-impression"
                    />
                </div>
            </fieldset>

            <fieldset class="space-y-3">
                <legend class="text-sm font-semibold text-zinc-900">Other settings</legend>
                <div class="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
                    <LInput
                        name="minScore"
                        label="Smallest interest kept"
                        type="number"
                        step="0.001"
                        v-model="form.minScore"
                        data-test="affinity-config-minScore"
                    />
                    <LInput
                        name="maxTags"
                        label="Most interests remembered"
                        type="number"
                        step="1"
                        v-model="form.maxTags"
                        data-test="affinity-config-maxTags"
                    />
                    <LInput
                        name="depthScale"
                        label="How fast new activity changes things"
                        type="number"
                        step="1"
                        v-model="form.depthScale"
                        data-test="affinity-config-depthScale"
                    />
                    <LInput
                        name="readFloorPercent"
                        label="Reading needed for it to count (%)"
                        type="number"
                        step="1"
                        v-model="form.readFloorPercent"
                        data-test="affinity-config-readFloorPercent"
                    />
                </div>
            </fieldset>
        </div>

        <template #footer>
            <div class="flex justify-end gap-2">
                <LButton
                    variant="secondary"
                    @click="isVisible = false"
                    data-test="affinity-config-cancel"
                >
                    Cancel
                </LButton>
                <LButton
                    variant="primary"
                    :icon="isSaving ? LoadingSpinner : undefined"
                    :disabled="isSaving"
                    @click="save"
                    data-test="affinity-config-save"
                >
                    {{ isSaving ? "Saving..." : "Save" }}
                </LButton>
            </div>
        </template>
    </LModal>
</template>
