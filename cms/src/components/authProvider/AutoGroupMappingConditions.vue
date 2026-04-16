<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { type AuthProviderCondition, type GroupDto } from "luminary-shared";

type AuthProviderGroupMapping = {
    groupIds: string[];
    conditions: AuthProviderCondition[];
};
import LButton from "../button/LButton.vue";
import LInput from "../forms/LInput.vue";
import LCombobox from "../forms/LCombobox.vue";
import LSelect from "../forms/LSelect.vue";
import { TrashIcon, UserGroupIcon, XCircleIcon } from "@heroicons/vue/24/outline";
import { PencilSquareIcon, CheckIcon } from "@heroicons/vue/20/solid";

const props = defineProps<{
    modelValue: AuthProviderGroupMapping[] | undefined;
    availableGroups: GroupDto[];
    disabled?: boolean;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: AuthProviderGroupMapping[]];
}>();

const mappings = computed({
    get() {
        return props.modelValue ?? [];
    },
    set(value) {
        emit("update:modelValue", value);
    },
});

// Mutable refs per row so LCombobox (push/splice) can update selection; we sync to parent.
// Each row is the set of group _ids assigned by that mapping when its conditions match.
const groupSelectionByIndex = ref<string[][]>([]);
watch(
    () => props.modelValue,
    (val) => {
        groupSelectionByIndex.value = (val ?? []).map((m) => {
            // Prefer new `groupIds`; fall back to legacy scalar `groupId` so mid-migration
            // docs render correctly until the next save normalizes them server-side.
            if (Array.isArray(m.groupIds)) return m.groupIds.slice();
            const legacyId = (m as unknown as { groupId?: string }).groupId;
            return legacyId ? [legacyId] : [];
        });
    },
    { immediate: true },
);
watch(
    groupSelectionByIndex,
    (rows) => {
        rows.forEach((arr, idx) => {
            const current = props.modelValue?.[idx]?.groupIds ?? [];
            if (!arraysShallowEqual(current, arr)) {
                updateMappingGroupIds(idx, arr.slice());
            }
        });
    },
    { deep: true },
);

function arraysShallowEqual(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

const groupOptions = computed(() =>
    props.availableGroups.map((g) => ({
        id: g._id,
        label: g.name,
        value: g._id,
    })),
);

// Search/filter for group mappings
const searchQuery = ref("");
const filteredMappings = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    const indexed = mappings.value.map((m, i) => ({ mapping: m, originalIndex: i }));
    if (!q) return indexed;
    return indexed.filter(({ mapping }) =>
        (mapping.groupIds ?? []).some((id: string) => {
            const group = props.availableGroups.find((g) => g._id === id);
            return group?.name?.toLowerCase().includes(q) ?? false;
        }),
    );
});

const CONDITION_TYPES: {
    value: AuthProviderCondition["type"];
    label: string;
}[] = [
    { value: "claimEquals", label: "Claim equals" },
    { value: "claimIn", label: "Claim in" },
];

// Track which condition is being edited: "mappingIdx-conditionIdx"
const editingKey = ref<string | null>(null);

function conditionKey(mIdx: number, cIdx: number) {
    return `${mIdx}-${cIdx}`;
}

function isEditing(mIdx: number, cIdx: number) {
    return editingKey.value === conditionKey(mIdx, cIdx);
}

function startEdit(mIdx: number, cIdx: number) {
    editingKey.value = conditionKey(mIdx, cIdx);
}

function stopEdit() {
    editingKey.value = null;
}

function conditionSummary(cond: AuthProviderCondition): {
    prefix: string;
    parts: { text: string; placeholder: boolean }[];
} {
    if (cond.type === "authenticated") {
        return { prefix: "", parts: [{ text: "User is authenticated", placeholder: false }] };
    }
    if (cond.type === "claimEquals") {
        const path = cond.claimPath?.trim();
        const val = (cond.value as string | undefined)?.trim();
        return {
            prefix: "if",
            parts: [
                { text: path || "set claim path", placeholder: !path },
                { text: "=", placeholder: false },
                { text: val || "set required value", placeholder: !val },
            ],
        };
    }
    if (cond.type === "claimIn") {
        const path = cond.claimPath?.trim();
        const vals = (cond.values ?? []).join(", ").trim();
        return {
            prefix: "if",
            parts: [
                { text: path || "set claim path", placeholder: !path },
                { text: "IN", placeholder: false },
                { text: vals || "set values", placeholder: !vals },
            ],
        };
    }
    return { prefix: "", parts: [] };
}

function addGroupMapping() {
    searchQuery.value = "";
    const list = [...(props.modelValue ?? [])];
    list.push({
        groupIds: [],
        conditions: [],
    });
    emit("update:modelValue", list);
    nextTick(() => {
        const newIdx = list.length - 1;
        document
            .getElementById(`group-mapping-${newIdx}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
}

function removeGroupMapping(idx: number) {
    const list = props.modelValue ?? [];
    if (idx < 0 || idx >= list.length) return;
    const next = list.slice();
    next.splice(idx, 1);
    emit("update:modelValue", next);
}

function addCondition(mappingIdx: number) {
    const list = props.modelValue ?? [];
    const mapping = list[mappingIdx];
    if (!mapping) return;
    const newCondIdx = mapping.conditions.length;
    const next = list.slice();
    next[mappingIdx] = {
        ...mapping,
        conditions: [...mapping.conditions, { type: "claimEquals", claimPath: "", value: "" }],
    };
    emit("update:modelValue", next);
    editingKey.value = conditionKey(mappingIdx, newCondIdx);
}

function removeCondition(mappingIdx: number, conditionIdx: number) {
    const list = props.modelValue ?? [];
    const mapping = list[mappingIdx];
    if (!mapping) return;
    const next = list.slice();
    const conditions = mapping.conditions.slice();
    conditions.splice(conditionIdx, 1);
    next[mappingIdx] = { ...mapping, conditions };
    emit("update:modelValue", next);
    if (editingKey.value === conditionKey(mappingIdx, conditionIdx)) {
        editingKey.value = null;
    }
}

function setConditionType(
    mappingIdx: number,
    conditionIdx: number,
    type: AuthProviderCondition["type"],
) {
    const list = props.modelValue ?? [];
    const mapping = list[mappingIdx];
    const cond = mapping?.conditions[conditionIdx];
    if (!mapping || !cond) return;
    const next = list.slice();
    const conditions = mapping.conditions.slice();
    if (type === "claimEquals") {
        conditions[conditionIdx] = { type: "claimEquals", claimPath: "", value: "" };
    } else if (type === "claimIn") {
        conditions[conditionIdx] = { type: "claimIn", claimPath: "", values: [] };
    } else {
        conditions[conditionIdx] = { type };
    }
    next[mappingIdx] = { ...mapping, conditions };
    emit("update:modelValue", next);
}

function updateMappingGroupIds(mappingIdx: number, groupIds: string[]) {
    const list = props.modelValue ?? [];
    const mapping = list[mappingIdx];
    if (!mapping) return;
    const next = list.slice();
    next[mappingIdx] = { ...mapping, groupIds };
    emit("update:modelValue", next);
}

function updateConditionClaimPath(mappingIdx: number, conditionIdx: number, value: string) {
    const list = props.modelValue ?? [];
    const mapping = list[mappingIdx];
    const cond = mapping?.conditions[conditionIdx];
    if (!mapping || !cond) return;
    const next = list.slice();
    const conditions = mapping.conditions.slice();
    conditions[conditionIdx] = { ...cond, claimPath: value };
    next[mappingIdx] = { ...mapping, conditions };
    emit("update:modelValue", next);
}

function updateConditionValue(mappingIdx: number, conditionIdx: number, value: string) {
    const list = props.modelValue ?? [];
    const mapping = list[mappingIdx];
    const cond = mapping?.conditions[conditionIdx];
    if (!mapping || !cond) return;
    const next = list.slice();
    const conditions = mapping.conditions.slice();
    conditions[conditionIdx] = { ...cond, value };
    next[mappingIdx] = { ...mapping, conditions };
    emit("update:modelValue", next);
}

function updateConditionValues(mappingIdx: number, conditionIdx: number, value: string) {
    const list = props.modelValue ?? [];
    const mapping = list[mappingIdx];
    const cond = mapping?.conditions[conditionIdx];
    if (!mapping || !cond) return;
    const values = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const next = list.slice();
    const conditions = mapping.conditions.slice();
    conditions[conditionIdx] = { ...cond, values };
    next[mappingIdx] = { ...mapping, conditions };
    emit("update:modelValue", next);
}
</script>

<template>
    <div class="rounded-md border border-zinc-200 bg-white p-2">
        <!-- Section header -->
        <div class="mb-1 flex items-start justify-between gap-2">
            <div>
                <label class="text-sm font-medium text-gray-800">Group Assignments</label>
                <p class="mt-0.5 text-[11px] text-gray-400">
                    Assign one or more groups when all conditions are true (AND). e.g. Assign
                    "St Mary's Editors" and "St Mary's Reviewers" if Authenticated and churchName
                    equals "St Mary's".
                </p>
            </div>
            <LButton
                size="sm"
                variant="tertiary"
                class="shrink-0"
                :disabled="disabled"
                @click="addGroupMapping"
            >
                + Add Rule
            </LButton>
        </div>

        <!-- Search filter (shown when there are many rules) -->
        <LInput
            v-if="mappings.length > 3"
            name="group-mapping-search"
            :icon="UserGroupIcon"
            v-model="searchQuery"
            placeholder="Filter by group name..."
            size="sm"
            class="mt-1"
        />

        <!-- Mapping cards -->
        <div
            v-for="{ mapping, originalIndex: aIdx } in filteredMappings"
            :key="aIdx"
            :id="'group-mapping-' + aIdx"
            class="mt-2 rounded-md border border-gray-200 bg-white"
        >
            <!-- Group selector -->
            <div class="flex w-full items-center gap-2 px-2 py-1">
                <LCombobox
                    v-model:selected-options="groupSelectionByIndex[aIdx]"
                    class="w-full"
                    :options="groupOptions"
                    :disabled="disabled"
                    :show-selected-in-dropdown="false"
                    :placeholder="
                        groupSelectionByIndex[aIdx]?.length
                            ? 'Add or remove groups...'
                            : 'Select groups to assign...'
                    "
                    :inline-tags="true"
                    no-border
                />
                <button
                    type="button"
                    class="shrink-0 text-gray-300 transition-colors hover:text-red-500 disabled:pointer-events-none"
                    :disabled="disabled"
                    @click="removeGroupMapping(aIdx)"
                    aria-label="Remove rule"
                >
                    <TrashIcon class="size-6 text-current" />
                </button>
            </div>

            <!-- Conditions -->
            <div class="border-t border-gray-100 px-3 pb-2 pt-1">
                <p class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Additional Conditions (AND)
                </p>

                <p
                    v-if="mapping.conditions.filter((c: AuthProviderCondition) => c.type !== 'authenticated').length === 0"
                    class="mb-1 text-[11px] italic text-gray-400"
                >
                    Assigned to all authenticated users.
                </p>

                <template v-for="(cond, cIdx) in mapping.conditions" :key="cIdx">
                    <div
                        v-if="cond.type !== 'authenticated'"
                        class="mb-1 rounded-md border border-zinc-100 bg-zinc-50/90"
                    >
                        <!-- View mode -->
                        <div
                            v-if="!isEditing(aIdx, cIdx)"
                            class="group flex cursor-pointer items-center gap-1.5 px-2 py-1.5"
                            @click="!disabled && startEdit(aIdx, cIdx)"
                        >
                            <span class="min-w-0 flex-1 truncate font-mono text-xs text-gray-700">
                                <span
                                    v-if="conditionSummary(cond).prefix"
                                    class="mr-1 font-semibold text-zinc-400"
                                    >{{ conditionSummary(cond).prefix }}</span
                                >
                                <template
                                    v-for="(part, pIdx) in conditionSummary(cond).parts"
                                    :key="pIdx"
                                >
                                    <span v-if="part.placeholder" class="italic text-zinc-500">{{
                                        part.text
                                    }}</span>
                                    <span
                                        v-else-if="part.text === '=' || part.text === 'IN'"
                                        class="mx-1 font-semibold text-zinc-400"
                                        >{{ part.text }}</span
                                    >
                                    <span v-else class="text-gray-700">{{ part.text }}</span>
                                </template>
                            </span>
                            <PencilSquareIcon
                                v-if="!disabled"
                                class="size-3.5 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-400"
                            />
                            <button
                                type="button"
                                class="shrink-0 text-gray-300 transition-colors hover:text-red-500 disabled:pointer-events-none"
                                :disabled="disabled"
                                @click.stop="removeCondition(aIdx, cIdx)"
                                aria-label="Remove condition"
                            >
                                <XCircleIcon class="size-4 text-current" />
                            </button>
                        </div>

                        <!-- Edit mode -->
                        <div v-else class="flex flex-wrap items-center gap-1 p-1.5 sm:flex-nowrap">
                            <LSelect
                                :model-value="cond.type"
                                :options="CONDITION_TYPES"
                                :disabled="disabled"
                                size="sm"
                                class="w-full shrink-0 sm:w-auto [&>label]:mb-0"
                                @update:model-value="
                                    setConditionType(
                                        aIdx,
                                        cIdx,
                                        $event as AuthProviderCondition['type'],
                                    )
                                "
                            />

                            <template v-if="cond.type === 'claimEquals'">
                                <LInput
                                    :name="`gm-${aIdx}-${cIdx}-claim`"
                                    :model-value="cond.claimPath ?? ''"
                                    size="sm"
                                    placeholder="claim path"
                                    :disabled="disabled"
                                    class="w-full min-w-0 sm:flex-1"
                                    @update:model-value="
                                        updateConditionClaimPath(aIdx, cIdx, $event)
                                    "
                                />
                                <span class="shrink-0 text-[11px] font-semibold text-zinc-400"
                                    >=</span
                                >
                                <LInput
                                    :name="`gm-${aIdx}-${cIdx}-value`"
                                    :model-value="(cond.value as string) ?? ''"
                                    size="sm"
                                    placeholder="required value"
                                    :disabled="disabled"
                                    class="w-full min-w-0 sm:flex-1"
                                    @update:model-value="updateConditionValue(aIdx, cIdx, $event)"
                                />
                            </template>

                            <template v-else-if="cond.type === 'claimIn'">
                                <div class="flex w-full min-w-0 items-center gap-1 sm:flex-1">
                                    <LInput
                                        :name="`gm-${aIdx}-${cIdx}-claimIn`"
                                        :model-value="cond.claimPath ?? ''"
                                        size="sm"
                                        placeholder="claim path"
                                        :disabled="disabled"
                                        class="min-w-0 flex-1"
                                        @update:model-value="
                                            updateConditionClaimPath(aIdx, cIdx, $event)
                                        "
                                    />
                                    <span class="shrink-0 text-[11px] font-semibold text-zinc-400"
                                        >IN</span
                                    >
                                </div>
                                <LInput
                                    :name="`gm-${aIdx}-${cIdx}-values`"
                                    :model-value="(cond.values ?? []).join(', ')"
                                    size="sm"
                                    placeholder="value1, value2"
                                    :disabled="disabled"
                                    class="w-full min-w-0 sm:flex-1"
                                    @update:model-value="updateConditionValues(aIdx, cIdx, $event)"
                                />
                            </template>

                            <div class="ml-auto flex shrink-0 items-center gap-1">
                                <button
                                    type="button"
                                    class="flex h-5 w-5 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                                    @click="stopEdit"
                                    aria-label="Done editing"
                                >
                                    <CheckIcon class="size-4 text-current" />
                                </button>
                                <button
                                    type="button"
                                    class="flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:text-red-500 disabled:pointer-events-none"
                                    :disabled="disabled"
                                    @click="removeCondition(aIdx, cIdx)"
                                    aria-label="Remove condition"
                                >
                                    <XCircleIcon class="size-4 text-current" />
                                </button>
                            </div>
                        </div>
                    </div>
                </template>

                <LButton
                    size="sm"
                    variant="tertiary"
                    :disabled="disabled"
                    @click="addCondition(aIdx)"
                >
                    + Add Condition
                </LButton>
            </div>
        </div>

        <p v-if="!mappings.length" class="mt-2 text-[11px] italic text-gray-400">
            No rules yet. Click "+ Add Rule" to assign a group based on JWT claims.
        </p>
    </div>
</template>
