<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
    AckStatus,
    AclPermission,
    DocType,
    getAccessibleGroups,
    type ContentDto,
    type Uuid,
    useSharedHybridQuery,
} from "luminary-shared";
import { cmsLanguageIdAsRef } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import { useDefaultAffinity } from "@/composables/useDefaultAffinity";
import LButton from "@/components/button/LButton.vue";
import LModal from "@/components/modals/LModal.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { PlusIcon, TrashIcon } from "@heroicons/vue/20/solid";

type Row = {
    tagId: Uuid;
    score: number;
};

const isVisible = defineModel<boolean>("isVisible");
const isSaving = ref(false);
const rows = ref<Row[]>([]);
const selectedTagId = ref("");
const { addNotification } = useNotificationStore();

const { current: defaultAffinity, saveAffinity } = useDefaultAffinity();

const tagContent = useSharedHybridQuery<ContentDto>(
    () => ({
        selector: {
            type: DocType.Content,
            parentType: DocType.Tag,
        },
        $limit: 1000,
    }),
    { live: true },
);

const tagOptions = computed(() => {
    const byParent = new Map<Uuid, ContentDto>();
    for (const doc of tagContent.value) {
        const current = byParent.get(doc.parentId);
        if (!current || doc.language === cmsLanguageIdAsRef.value) byParent.set(doc.parentId, doc);
    }
    return [...byParent.values()]
        .map((doc) => ({ id: doc.parentId, label: doc.title || doc.parentId }))
        .sort((a, b) => a.label.localeCompare(b.label));
});

const selectedIds = computed(() => new Set(rows.value.map((row) => row.tagId)));
const availableTagOptions = computed(() =>
    tagOptions.value.filter((option) => !selectedIds.value.has(option.id)),
);

function tagLabel(tagId: Uuid) {
    return tagOptions.value.find((option) => option.id === tagId)?.label ?? tagId;
}

function resetRows() {
    rows.value = Object.entries(defaultAffinity.value?.affinity ?? {})
        .map(([tagId, score]) => ({ tagId, score }))
        .sort((a, b) => tagLabel(a.tagId).localeCompare(tagLabel(b.tagId)));
    selectedTagId.value = availableTagOptions.value[0]?.id ?? "";
}

watch(
    isVisible,
    (visible) => {
        if (visible) resetRows();
    },
    { immediate: true },
);

watch(defaultAffinity, () => {
    if (isVisible.value) resetRows();
});

watch(availableTagOptions, (options) => {
    if (!selectedTagId.value || selectedIds.value.has(selectedTagId.value)) {
        selectedTagId.value = options[0]?.id ?? "";
    }
});

function addTag() {
    if (!selectedTagId.value) return;
    rows.value.push({ tagId: selectedTagId.value, score: 0.3 });
    rows.value.sort((a, b) => tagLabel(a.tagId).localeCompare(tagLabel(b.tagId)));
    selectedTagId.value = availableTagOptions.value[0]?.id ?? "";
}

function removeTag(tagId: Uuid) {
    rows.value = rows.value.filter((row) => row.tagId !== tagId);
}

function editableMemberOf(): Uuid[] {
    if (defaultAffinity.value?.memberOf?.length) return [...defaultAffinity.value.memberOf];
    return getAccessibleGroups(AclPermission.Edit)[DocType.DefaultAffinity]?.slice(0, 1) ?? [];
}

function normalizedAffinity() {
    const affinity: Record<Uuid, number> = {};
    for (const row of rows.value) {
        const score = Number(row.score);
        if (!row.tagId || !Number.isFinite(score)) continue;
        affinity[row.tagId] = Math.min(1, Math.max(0, score));
    }
    return affinity;
}

function formatScore(score: number) {
    return Number(score).toFixed(2);
}

async function save() {
    const memberOf = editableMemberOf();
    if (!memberOf.length) {
        addNotification({
            title: "Can't save default affinity",
            description: "You do not have edit access to the default affinity document.",
            state: "error",
        });
        return;
    }

    isSaving.value = true;
    try {
        const res = await saveAffinity(normalizedAffinity(), memberOf);
        if (res && res.ack === AckStatus.Rejected) {
            addNotification({
                title: "Can't save default affinity",
                description: res.message || "The server rejected the update.",
                state: "error",
            });
            return;
        }
        addNotification({
            title: "Default affinity saved",
            description: "New users will start from this recommendation profile.",
            state: "success",
        });
        isVisible.value = false;
    } catch (error) {
        addNotification({
            title: "Can't save default affinity",
            description: error instanceof Error ? error.message : "The change could not be saved.",
            state: "error",
        });
    } finally {
        isSaving.value = false;
    }
}
</script>

<template>
    <LModal v-model:is-visible="isVisible" heading="Default affinity" largeModal>
        <div class="w-[min(42rem,calc(100vw-2rem))] space-y-4">
            <div class="text-sm text-zinc-600">
                Pick the tags and scores used to seed a first-time user's recommendations.
            </div>

            <div class="flex items-end gap-2">
                <label class="min-w-0 flex-1">
                    <span class="mb-2 block text-sm font-medium text-zinc-700">Tag</span>
                    <select
                        v-model="selectedTagId"
                        class="block w-full rounded-md border-0 py-2 text-sm text-zinc-900 ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-zinc-950"
                        data-test="default-affinity-tag-select"
                    >
                        <option value="" disabled>No available tags</option>
                        <option
                            v-for="option in availableTagOptions"
                            :key="option.id"
                            :value="option.id"
                        >
                            {{ option.label }}
                        </option>
                    </select>
                </label>
                <LButton
                    :icon="PlusIcon"
                    :disabled="!selectedTagId"
                    @click="addTag"
                    data-test="default-affinity-add-tag"
                >
                    Add
                </LButton>
            </div>

            <div class="divide-y divide-zinc-200 rounded-md ring-1 ring-zinc-200">
                <div
                    v-if="rows.length === 0"
                    class="px-3 py-6 text-center text-sm text-zinc-500"
                    data-test="default-affinity-empty"
                >
                    No default affinity tags selected.
                </div>
                <div
                    v-for="row in rows"
                    :key="row.tagId"
                    class="grid grid-cols-[minmax(0,1fr)_minmax(10rem,16rem)_3rem_2.5rem] items-center gap-3 px-3 py-2"
                >
                    <div class="min-w-0 truncate text-sm font-medium text-zinc-900">
                        {{ tagLabel(row.tagId) }}
                    </div>
                    <input
                        v-model.number="row.score"
                        :name="`score-${row.tagId}`"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        class="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-800"
                        data-test="default-affinity-score"
                    />
                    <div class="text-right text-sm tabular-nums text-zinc-700">
                        {{ formatScore(row.score) }}
                    </div>
                    <LButton
                        :icon="TrashIcon"
                        variant="muted"
                        size="sm"
                        iconClass="h-5 w-5"
                        @click="removeTag(row.tagId)"
                        data-test="default-affinity-remove-tag"
                    />
                </div>
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end gap-2">
                <LButton
                    variant="secondary"
                    @click="isVisible = false"
                    data-test="default-affinity-cancel"
                >
                    Cancel
                </LButton>
                <LButton
                    variant="primary"
                    :icon="isSaving ? LoadingSpinner : undefined"
                    :disabled="isSaving"
                    @click="save"
                    data-test="default-affinity-save"
                >
                    {{ isSaving ? "Saving..." : "Save" }}
                </LButton>
            </div>
        </template>
    </LModal>
</template>
