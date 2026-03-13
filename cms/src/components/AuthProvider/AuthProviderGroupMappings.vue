<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
    type AuthProviderCondition,
    type AuthProviderGroupMapping,
    type GroupDto,
} from "luminary-shared";
import LButton from "../button/LButton.vue";
import LInput from "../forms/LInput.vue";
import LCombobox from "../forms/LCombobox.vue";
import LSelect from "../forms/LSelect.vue";
import { TrashIcon, XCircleIcon } from "@heroicons/vue/24/outline";

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
const groupSelectionByIndex = ref<string[][]>([]);
watch(
    () => props.modelValue,
    (val) => {
        groupSelectionByIndex.value = (val ?? []).map((m) => (m.groupId ? [m.groupId] : []));
    },
    { immediate: true },
);
watch(
    groupSelectionByIndex,
    (rows) => {
        rows.forEach((arr, idx) => {
            const groupId = arr.length ? arr[arr.length - 1] : "";
            if (props.modelValue?.[idx]?.groupId !== groupId) {
                updateMappingGroupId(idx, groupId);
            }
        });
    },
    { deep: true },
);

const CONDITION_TYPES: {
    value: AuthProviderCondition["type"];
    label: string;
}[] = [
    { value: "authenticated", label: "Authenticated" },
    { value: "claimEquals", label: "Claim equals" },
    { value: "claimIn", label: "Claim in" },
];

function addGroupMapping() {
    const list = [...(props.modelValue ?? [])];
    list.push({
        groupId: "",
        conditions: [{ type: "authenticated" }],
    });
    emit("update:modelValue", list);
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
    const next = list.slice();
    next[mappingIdx] = {
        ...mapping,
        conditions: [...mapping.conditions, { type: "authenticated" }],
    };
    emit("update:modelValue", next);
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

function updateMappingGroupId(mappingIdx: number, groupId: string) {
    const list = props.modelValue ?? [];
    const mapping = list[mappingIdx];
    if (!mapping) return;
    const next = list.slice();
    next[mappingIdx] = { ...mapping, groupId };
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
                    Assign a group when all conditions are true (AND). e.g. Assign "St Mary's
                    Editors" if Authenticated and churchName equals "St Mary's".
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

        <!-- Mapping cards -->
        <div
            v-for="(mapping, aIdx) in mappings"
            :key="aIdx"
            class="mt-2 rounded-md border border-gray-200 bg-white"
        >
            <!-- Card header -->
            <div
                class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2"
            >
                <span class="text-xs font-semibold text-gray-600">Assign to group</span>
                <button
                    type="button"
                    class="text-gray-300 transition-colors hover:text-red-500 disabled:pointer-events-none"
                    :disabled="disabled"
                    @click="removeGroupMapping(aIdx)"
                    aria-label="Remove rule"
                >
                    <TrashIcon class="size-4 shrink-0 text-current" />
                </button>
            </div>

            <!-- Group selector -->
            <div class="px-3 py-2">
                <LCombobox
                    label="Group"
                    v-model:selected-options="groupSelectionByIndex[aIdx]"
                    class="[&_.mb-2]:mb-0"
                    :options="
                        availableGroups.map((g) => ({
                            id: g._id,
                            label: g.name,
                            value: g._id,
                        }))
                    "
                    :disabled="disabled"
                    :show-selected-in-dropdown="false"
                    :show-selected-labels="true"
                />
            </div>

            <!-- Conditions -->
            <div class="border-t border-gray-100 px-3 pb-2 pt-1">
                <p class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Conditions (AND)
                </p>

                <div
                    v-for="(cond, cIdx) in mapping.conditions"
                    :key="cIdx"
                    class="mb-1 flex items-center gap-1.5 rounded-md border border-zinc-100 bg-zinc-50/90 p-1"
                >
                    <LSelect
                        :model-value="cond.type"
                        :options="CONDITION_TYPES"
                        :disabled="disabled"
                        size="sm"
                        class="shrink-0 [&>label]:mb-0"
                        @update:model-value="
                            setConditionType(aIdx, cIdx, $event as AuthProviderCondition['type'])
                        "
                    />

                    <template v-if="cond.type === 'claimEquals'">
                        <LInput
                            :name="`gm-${aIdx}-${cIdx}-claim`"
                            :model-value="cond.claimPath ?? ''"
                            size="sm"
                            placeholder="Claim path (e.g. churchName)"
                            :disabled="disabled"
                            class="min-w-0 flex-1"
                            @update:model-value="updateConditionClaimPath(aIdx, cIdx, $event)"
                        />
                        <span class="shrink-0 text-[11px] font-medium text-gray-400">=</span>
                        <LInput
                            :name="`gm-${aIdx}-${cIdx}-value`"
                            :model-value="(cond.value as string) ?? ''"
                            size="sm"
                            placeholder="Required value"
                            :disabled="disabled"
                            class="min-w-0 flex-1"
                            @update:model-value="updateConditionValue(aIdx, cIdx, $event)"
                        />
                    </template>

                    <template v-else-if="cond.type === 'claimIn'">
                        <LInput
                            :name="`gm-${aIdx}-${cIdx}-claimIn`"
                            :model-value="cond.claimPath ?? ''"
                            size="sm"
                            placeholder="Claim path"
                            :disabled="disabled"
                            class="min-w-0 flex-1"
                            @update:model-value="updateConditionClaimPath(aIdx, cIdx, $event)"
                        />
                        <span class="shrink-0 text-[11px] font-medium text-gray-400">IN</span>
                        <LInput
                            :name="`gm-${aIdx}-${cIdx}-values`"
                            :model-value="(cond.values ?? []).join(', ')"
                            size="sm"
                            placeholder="value1, value2"
                            :disabled="disabled"
                            class="min-w-0 flex-1"
                            @update:model-value="updateConditionValues(aIdx, cIdx, $event)"
                        />
                    </template>

                    <button
                        type="button"
                        class="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-red-500 disabled:pointer-events-none"
                        :disabled="disabled"
                        @click="removeCondition(aIdx, cIdx)"
                        aria-label="Remove condition"
                    >
                        <XCircleIcon class="size-4 shrink-0 text-current" />
                    </button>
                </div>

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
