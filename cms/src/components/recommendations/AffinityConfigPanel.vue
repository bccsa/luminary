<script setup lang="ts">
import { computed, ref, watch, watchEffect } from "vue";
import {
    AckStatus,
    AclPermission,
    DocType,
    getAccessibleGroups,
    type AffinityConfig,
} from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import { useDefaultAffinity } from "@/composables/useDefaultAffinity";
import { isMobileScreen } from "@/globalConfig";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LInput from "@/components/forms/LInput.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";

const isSaving = ref(false);
const { addNotification } = useNotificationStore();

const { current, config: savedConfig, saveConfig } = useDefaultAffinity();

// Only collapsible below the same breakpoint (1024px) that collapses the page's own grid to
// a single column — on desktop the panel sits beside the interest list with room to spare,
// so it stays permanently open instead of hiding behind a toggle.
const collapsed = ref(isMobileScreen.value);
watchEffect(() => {
    if (!isMobileScreen.value) collapsed.value = false;
});

/**
 * Plain-object clone of a (possibly Vue-reactive) config — `structuredClone` can throw on a
 * reactive Proxy in some environments, so build a fresh plain object field-by-field instead.
 */
function cloneConfig(config: AffinityConfig): AffinityConfig {
    return {
        halfLifeDays: config.halfLifeDays,
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

// The panel is always mounted (no modal open/close lifecycle to gate this on), so only
// resync from a remote config change while the form has no unsaved edits — otherwise a
// second admin's save would silently wipe whatever's being typed here.
const isDirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(savedConfig.value));
watch(savedConfig, () => {
    if (!isDirty.value) resetForm();
});

/** Two-way percent view of a fraction field: displays/edits `fraction * 100`, rounded only to
 *  kill float noise (not to lose precision — these fractions can be as small as 0.0002). */
function percentField(get: () => number, set: (value: number) => void) {
    return computed<number>({
        get: () => Math.round(get() * 100 * 10000) / 10000,
        set: (value) => set((Number(value) || 0) / 100),
    });
}

const hitWeightPercent = percentField(
    () => form.value.hitWeight,
    (value) => (form.value.hitWeight = value),
);
const minScorePercent = percentField(
    () => form.value.minScore,
    (value) => (form.value.minScore = value),
);
const bookmarkPercent = percentField(
    () => form.value.eventWeight.bookmark,
    (value) => (form.value.eventWeight.bookmark = value),
);
const bookmarkRemovedPercent = percentField(
    () => form.value.eventWeight.bookmarkRemoved,
    (value) => (form.value.eventWeight.bookmarkRemoved = value),
);
const completionPercent = percentField(
    () => form.value.eventWeight.completion,
    (value) => (form.value.eventWeight.completion = value),
);
const readCompletionPercent = percentField(
    () => form.value.eventWeight.readCompletion,
    (value) => (form.value.eventWeight.readCompletion = value),
);
const highlightPercent = percentField(
    () => form.value.eventWeight.highlight,
    (value) => (form.value.eventWeight.highlight = value),
);
const highlightRemovedPercent = percentField(
    () => form.value.eventWeight.highlightRemoved,
    (value) => (form.value.eventWeight.highlightRemoved = value),
);
const impressionPercent = percentField(
    () => form.value.eventWeight.impression,
    (value) => (form.value.eventWeight.impression = value),
);
const searchClickPercent = percentField(
    () => form.value.eventWeight.searchClick,
    (value) => (form.value.eventWeight.searchClick = value),
);

function clamp(value: number, min: number, max: number, fallback: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

/** Mirrors the server-side clamping in `processDefaultAffinityDto.ts` — defense in depth. */
function normalizedConfig(): AffinityConfig {
    const c = form.value;

    return {
        halfLifeDays: clamp(c.halfLifeDays, 1, 3650, savedConfig.value.halfLifeDays),
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
            completion: clamp(
                c.eventWeight.completion,
                -1,
                1,
                savedConfig.value.eventWeight.completion,
            ),
            readCompletion: clamp(
                c.eventWeight.readCompletion,
                -1,
                1,
                savedConfig.value.eventWeight.readCompletion,
            ),
            highlight: clamp(
                c.eventWeight.highlight,
                -1,
                1,
                savedConfig.value.eventWeight.highlight,
            ),
            highlightRemoved: clamp(
                c.eventWeight.highlightRemoved,
                -1,
                1,
                savedConfig.value.eventWeight.highlightRemoved,
            ),
            impression: clamp(
                c.eventWeight.impression,
                -1,
                1,
                savedConfig.value.eventWeight.impression,
            ),
            searchClick: clamp(
                c.eventWeight.searchClick,
                -1,
                1,
                savedConfig.value.eventWeight.searchClick,
            ),
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
    <LCard
        title="Recommendation settings"
        :collapsible="isMobileScreen"
        v-model:collapsed="collapsed"
        fill-height
    >
        <div class="space-y-3">
            <div class="text-sm text-zinc-600">
                Control how much attention different interests get, and how strongly each action
                shapes what people are shown next.
            </div>

            <fieldset class="space-y-1.5">
                <legend class="text-sm font-semibold text-zinc-900">
                    How much each action counts
                </legend>
                <div class="grid grid-cols-2 items-end gap-x-3 gap-y-1.5 sm:grid-cols-3">
                    <LInput
                        name="hitWeight"
                        label="Viewing something"
                        type="number"
                        step="0.01"
                        size="sm"
                        rightAddOn="%"
                        v-model="hitWeightPercent"
                        data-test="affinity-config-hitWeight"
                    />
                    <LInput
                        name="eventWeight-bookmark"
                        label="Saving/bookmarking"
                        type="number"
                        step="0.01"
                        size="sm"
                        rightAddOn="%"
                        v-model="bookmarkPercent"
                        data-test="affinity-config-eventWeight-bookmark"
                    />
                    <LInput
                        name="eventWeight-bookmarkRemoved"
                        label="Un-saving"
                        type="number"
                        step="0.01"
                        size="sm"
                        rightAddOn="%"
                        v-model="bookmarkRemovedPercent"
                        data-test="affinity-config-eventWeight-bookmarkRemoved"
                    />
                    <LInput
                        name="eventWeight-completion"
                        label="Finishing a video/audio"
                        type="number"
                        step="0.01"
                        size="sm"
                        rightAddOn="%"
                        v-model="completionPercent"
                        data-test="affinity-config-eventWeight-completion"
                    />
                    <LInput
                        name="eventWeight-readCompletion"
                        label="Finishing an article"
                        type="number"
                        step="0.01"
                        size="sm"
                        rightAddOn="%"
                        v-model="readCompletionPercent"
                        data-test="affinity-config-eventWeight-readCompletion"
                    />
                    <LInput
                        name="eventWeight-highlight"
                        label="Highlighting text"
                        type="number"
                        step="0.01"
                        size="sm"
                        rightAddOn="%"
                        v-model="highlightPercent"
                        data-test="affinity-config-eventWeight-highlight"
                    />
                    <LInput
                        name="eventWeight-highlightRemoved"
                        label="Removing a highlight"
                        type="number"
                        step="0.01"
                        size="sm"
                        rightAddOn="%"
                        v-model="highlightRemovedPercent"
                        data-test="affinity-config-eventWeight-highlightRemoved"
                    />
                    <LInput
                        name="eventWeight-impression"
                        label="Scrolling past, unopened"
                        type="number"
                        step="0.01"
                        size="sm"
                        rightAddOn="%"
                        v-model="impressionPercent"
                        data-test="affinity-config-eventWeight-impression"
                    />
                    <LInput
                        name="eventWeight-searchClick"
                        label="Clicking a search result"
                        type="number"
                        step="0.01"
                        size="sm"
                        rightAddOn="%"
                        v-model="searchClickPercent"
                        data-test="affinity-config-eventWeight-searchClick"
                    />
                </div>
            </fieldset>

            <fieldset class="space-y-1.5">
                <legend class="text-sm font-semibold text-zinc-900">Other settings</legend>
                <div class="grid grid-cols-2 items-end gap-x-3 gap-y-1.5 sm:grid-cols-3">
                    <LInput
                        name="halfLifeDays"
                        label="Days until it halves"
                        type="number"
                        step="1"
                        size="sm"
                        v-model="form.halfLifeDays"
                        data-test="affinity-config-halfLifeDays"
                    />
                    <LInput
                        name="minScore"
                        label="Smallest interest kept"
                        type="number"
                        step="0.01"
                        size="sm"
                        rightAddOn="%"
                        v-model="minScorePercent"
                        data-test="affinity-config-minScore"
                    />
                    <LInput
                        name="maxTags"
                        label="Most interests remembered"
                        type="number"
                        step="1"
                        size="sm"
                        v-model="form.maxTags"
                        data-test="affinity-config-maxTags"
                    />
                    <LInput
                        name="depthScale"
                        label="How fast new activity changes things"
                        type="number"
                        step="1"
                        size="sm"
                        v-model="form.depthScale"
                        data-test="affinity-config-depthScale"
                    />
                    <LInput
                        name="readFloorPercent"
                        label="Reading needed for it to count"
                        type="number"
                        step="1"
                        size="sm"
                        rightAddOn="%"
                        v-model="form.readFloorPercent"
                        data-test="affinity-config-readFloorPercent"
                    />
                </div>
            </fieldset>
        </div>

        <template #footer>
            <div class="flex justify-end gap-2">
                <LButton variant="secondary" @click="resetForm" data-test="affinity-config-cancel">
                    Reset
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
    </LCard>
</template>
