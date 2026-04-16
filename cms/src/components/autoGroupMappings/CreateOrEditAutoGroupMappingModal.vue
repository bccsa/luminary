<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
    db,
    type AutoGroupMappingsDto,
    type AuthProviderCondition,
    type AuthProviderDto,
    type GroupDto,
    DocType,
    isConnected,
} from "luminary-shared";
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import LBadge from "../common/LBadge.vue";
import LDialog from "../common/LDialog.vue";
import LCombobox from "../forms/LCombobox.vue";
import LSelect from "../forms/LSelect.vue";
import FormErrors from "../authProvider/FormErrors.vue";
import { validate, type Validation } from "@/components/content/ContentValidator";
import { XCircleIcon } from "@heroicons/vue/24/outline";
import { ArrowUturnLeftIcon } from "@heroicons/vue/24/solid";
import _ from "lodash";

const props = defineProps<{
    isVisible: boolean;
    mapping?: AutoGroupMappingsDto;
    providers: AuthProviderDto[];
    groups: GroupDto[];
    disabled?: boolean;
    isDefaultPermissions?: boolean;
}>();

const emit = defineEmits<{
    close: [];
    save: [entry: AutoGroupMappingsDto];
    delete: [mappingId: string];
}>();

const isNew = computed(() => !props.mapping);
const showDeleteModal = ref(false);
const showDiscardModal = ref(false);

// ── Editable state + snapshot for dirty tracking ────────────────────────────

const editable = ref<AutoGroupMappingsDto>({
    _id: db.uuid(),
    type: DocType.AutoGroupMappings,
    updatedTimeUtc: Date.now(),
    memberOf: [],
    providerId: "",
    groupIds: [],
    conditions: [],
} as AutoGroupMappingsDto);

/** Snapshot taken when the modal opens, used to detect unsaved changes. */
const snapshot = ref<string>("");

function takeSnapshot() {
    const { updatedTimeUtc: _ts, ...rest } = editable.value; // eslint-disable-line @typescript-eslint/no-unused-vars
    snapshot.value = JSON.stringify(rest);
}

watch(
    () => props.mapping,
    (existing) => {
        if (existing) {
            const clone: AutoGroupMappingsDto = {
                ..._.cloneDeep(existing),
                providerId: existing.providerId ?? "",
                groupIds: existing.groupIds ?? [],
                conditions: existing.conditions ?? [],
            };
            editable.value = clone;
        } else {
            editable.value = {
                _id: db.uuid(),
                type: DocType.AutoGroupMappings,
                updatedTimeUtc: Date.now(),
                memberOf: props.groups.length > 0 ? [props.groups[0]._id] : [],
                providerId: "",
                groupIds: [],
                conditions: [],
            } as AutoGroupMappingsDto;
        }
        takeSnapshot();
    },
    { immediate: true },
);

const isDirty = computed(() => {
    const { updatedTimeUtc: _ts, ...rest } = editable.value; // eslint-disable-line @typescript-eslint/no-unused-vars
    return JSON.stringify(rest) !== snapshot.value;
});

// ── Validation ──────────────────────────────────────────────────────────────

const providerOptions = computed(() =>
    props.providers.map((p) => ({
        value: p._id,
        label: p.label || p.domain || p._id,
    })),
);

const groupOptions = computed(() =>
    props.groups.map((g) => ({
        id: g._id,
        label: g.name,
        value: g._id,
    })),
);

const hasAttemptedSave = ref(false);
const validations = ref<Validation[]>([]);

watch(
    [editable, hasAttemptedSave],
    ([e, attempted]) => {
        if (!attempted) return;
        if (!props.isDefaultPermissions) {
            validate(
                "An auth provider must be selected",
                "providerId",
                validations.value,
                e,
                (v) => !!v.providerId,
            );
        }
        validate(
            "At least one group must be selected",
            "groupIds",
            validations.value,
            e,
            (v) => (v.groupIds ?? []).length > 0,
        );
    },
    { deep: true },
);

const canSave = computed(() => {
    if ((editable.value.groupIds ?? []).length === 0) return false;
    if (props.isDefaultPermissions) return true;
    return !!editable.value.providerId;
});

// ── Actions ─────────────────────────────────────────────────────────────────

function handleSave() {
    hasAttemptedSave.value = true;
    if (!canSave.value) return;
    editable.value.updatedTimeUtc = Date.now();
    emit("save", _.cloneDeep(editable.value));
}

function handleDelete() {
    emit("delete", editable.value._id);
}

function handleClose() {
    if (isDirty.value && !isNew.value) {
        showDiscardModal.value = true;
    } else {
        emit("close");
    }
}

function discardAndClose() {
    showDiscardModal.value = false;
    emit("close");
}

function revert() {
    if (props.mapping) {
        editable.value = {
            ..._.cloneDeep(props.mapping),
            providerId: props.mapping.providerId ?? "",
            groupIds: props.mapping.groupIds ?? [],
            conditions: props.mapping.conditions ?? [],
        };
    }
    hasAttemptedSave.value = false;
}

function duplicate() {
    editable.value = {
        ..._.cloneDeep(editable.value),
        _id: db.uuid(),
    };
    takeSnapshot(); // new doc, reset snapshot so isDirty reflects edits from here
}

// ── Conditions ──────────────────────────────────────────────────────────────

const CONDITION_TYPES: { value: AuthProviderCondition["type"]; label: string }[] = [
    { value: "claimEquals", label: "Claim equals" },
    { value: "claimIn", label: "Claim in" },
];

const editingKey = ref<string | null>(null);

function isEditing(idx: number) {
    return editingKey.value === String(idx);
}

function toggleEdit(idx: number) {
    editingKey.value = editingKey.value === String(idx) ? null : String(idx);
}

function conditionSummary(cond: AuthProviderCondition): string {
    if (cond.type === "claimEquals") {
        const path = cond.claimPath?.trim() || "claim path";
        const val = (cond.value as string | undefined)?.trim() || "value";
        return `${path} = ${val}`;
    }
    if (cond.type === "claimIn") {
        const path = cond.claimPath?.trim() || "claim path";
        const vals = (cond.values ?? []).join(", ").trim() || "values";
        return `${path} is one of [${vals}]`;
    }
    return "Authenticated";
}

function addCondition() {
    editable.value.conditions.push({ type: "claimEquals", claimPath: "", value: "" });
    editingKey.value = String(editable.value.conditions.length - 1);
}

function removeCondition(idx: number) {
    editable.value.conditions.splice(idx, 1);
}

function setConditionType(idx: number, type: AuthProviderCondition["type"]) {
    if (type === "claimEquals") {
        editable.value.conditions[idx] = { type: "claimEquals", claimPath: "", value: "" };
    } else if (type === "claimIn") {
        editable.value.conditions[idx] = { type: "claimIn", claimPath: "", values: [] };
    } else {
        editable.value.conditions[idx] = { type };
    }
}


</script>

<template>
    <LDialog
        :open="isVisible"
        @update:open="(val: boolean | undefined) => !val && handleClose()"
        :title="
            props.isDefaultPermissions
                ? 'Default Group Access'
                : !isNew
                  ? 'Edit Auto Group Mapping'
                  : 'Create Auto Group Mapping'
        "
        @close="handleClose"
        :primaryAction="handleSave"
        primaryButtonText="Save"
        :primaryButtonDisabled="props.disabled || !isDirty || !isConnected"
        :secondaryAction="handleClose"
        secondaryButtonText="Cancel"
        stickToEdges
    >
        <LBadge v-if="props.disabled" variant="warning" withIcon class="mb-2">
            You do not have permission to edit this mapping
        </LBadge>
        <LBadge v-if="!isConnected" variant="warning" withIcon class="mb-2">
            Saving disabled: Unable to save while offline
        </LBadge>
        <LBadge v-if="isDirty && !isNew" variant="warning" withIcon class="mb-2">
            Unsaved changes
        </LBadge>

        <FormErrors :errors="[]" :validations="validations" />

        <!-- Default permissions message -->
        <div
            v-if="props.isDefaultPermissions"
            class="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700"
        >
            Unauthenticated and authenticated users will be assigned these groups regardless of
            provider.
        </div>

        <!-- Provider selector -->
        <div v-if="!props.isDefaultPermissions" class="mb-4">
            <LSelect
                :model-value="editable.providerId"
                @update:model-value="editable.providerId = $event as string"
                label="Auth Provider"
                :options="providerOptions"
                placeholder="Select a provider..."
                :disabled="props.disabled"
            />
        </div>

        <!-- Group selector -->
        <div class="mb-4">
            <LCombobox
                v-model:selected-options="editable.groupIds"
                label="Groups to assign"
                :options="groupOptions"
                :show-selected-in-dropdown="false"
                :showSelectedLabels="true"
                placeholder="Select groups to assign..."
                :disabled="props.disabled"
            />
        </div>

        <!-- Conditions -->
        <div
            v-if="!props.isDefaultPermissions"
            class="rounded-md border border-zinc-200 bg-white p-2"
        >
            <label class="text-sm font-medium text-gray-800">Conditions (OR)</label>
            <p class="mt-0.5 text-[11px] text-gray-400">
                Assign the selected groups when any condition is true. If no conditions are set,
                groups are assigned to all authenticated users.
            </p>

            <p
                v-if="
                    (editable.conditions ?? []).filter((c) => c.type !== 'authenticated').length ===
                    0
                "
                class="mt-2 text-[11px] italic text-gray-400"
            >
                Assigned to all authenticated users.
            </p>

            <template v-for="(cond, cIdx) in editable.conditions ?? []" :key="cIdx">
                <div
                    v-if="cond.type !== 'authenticated'"
                    class="mt-2 rounded-md border border-zinc-200 bg-white"
                >
                    <!-- Compact summary (click to expand) -->
                    <div
                        v-if="!isEditing(cIdx)"
                        class="group flex cursor-pointer items-center gap-2 px-3 py-2"
                        @click="!props.disabled && toggleEdit(cIdx)"
                    >
                        <span class="min-w-0 flex-1 truncate text-sm text-gray-700">
                            {{ conditionSummary(cond) }}
                        </span>
                        <button
                            type="button"
                            class="shrink-0 text-gray-300 transition-colors hover:text-red-500"
                            :disabled="props.disabled"
                            @click.stop="removeCondition(cIdx)"
                            aria-label="Remove condition"
                        >
                            <XCircleIcon class="size-4 text-current" />
                        </button>
                    </div>

                    <!-- Expanded edit form -->
                    <div v-else class="p-3">
                        <div class="flex items-center justify-between">
                            <LSelect
                                :model-value="cond.type"
                                :options="CONDITION_TYPES"
                                label="Condition type"
                                class="flex-1"
                                :disabled="props.disabled"
                                @update:model-value="
                                    setConditionType(
                                        cIdx,
                                        $event as AuthProviderCondition['type'],
                                    )
                                "
                            />
                            <button
                                type="button"
                                class="ml-2 mt-5 shrink-0 text-gray-400 transition-colors hover:text-red-500"
                                :disabled="props.disabled"
                                @click="removeCondition(cIdx)"
                                aria-label="Remove condition"
                            >
                                <XCircleIcon class="size-5 text-current" />
                            </button>
                        </div>

                        <template v-if="cond.type === 'claimEquals'">
                            <LInput
                                :name="`cond-${cIdx}-claim`"
                                v-model="cond.claimPath"
                                label="Claim path"
                                placeholder="e.g. roles, https://example.com/metadata.role"
                                class="mt-2 w-full"
                                :disabled="props.disabled"
                            />
                            <LInput
                                :name="`cond-${cIdx}-value`"
                                :model-value="(cond.value as string) ?? ''"
                                label="Required value"
                                placeholder="Exact value to match"
                                class="mt-2 w-full"
                                :disabled="props.disabled"
                                @update:model-value="cond.value = $event"
                            />
                        </template>

                        <template v-else-if="cond.type === 'claimIn'">
                            <LInput
                                :name="`cond-${cIdx}-claimIn`"
                                v-model="cond.claimPath"
                                label="Claim path"
                                placeholder="e.g. roles, https://example.com/metadata.role"
                                class="mt-2 w-full"
                                :disabled="props.disabled"
                            />
                            <LInput
                                :name="`cond-${cIdx}-values`"
                                :model-value="(cond.values ?? []).join(', ')"
                                label="Allowed values"
                                placeholder="value1, value2, value3"
                                class="mt-2 w-full"
                                :disabled="props.disabled"
                                @update:model-value="
                                    cond.values = $event
                                        .split(',')
                                        .map((s: string) => s.trim())
                                        .filter(Boolean)
                                "
                            />
                            <p class="mt-0.5 text-[11px] text-gray-400">Comma-separated</p>
                        </template>

                        <LButton
                            size="sm"
                            variant="secondary"
                            class="mt-3"
                            @click="toggleEdit(cIdx)"
                        >
                            Done
                        </LButton>
                    </div>
                </div>
            </template>

            <LButton
                size="sm"
                variant="tertiary"
                class="mt-2"
                @click="addCondition"
                :disabled="props.disabled"
            >
                + Add Condition
            </LButton>
        </div>

        <template v-if="!props.isDefaultPermissions" #footer-extra>
            <div class="flex gap-1">
                <LButton
                    v-if="!isNew"
                    variant="secondary"
                    context="danger"
                    :disabled="props.disabled"
                    @click="showDeleteModal = true"
                >
                    Delete
                </LButton>
                <LButton variant="secondary" :disabled="props.disabled" @click="duplicate">
                    Duplicate
                </LButton>
                <LButton
                    v-if="isDirty && !isNew"
                    variant="secondary"
                    size="sm"
                    :icon="ArrowUturnLeftIcon"
                    smallIcon
                    @click="revert"
                >
                    Revert
                </LButton>
            </div>
        </template>
    </LDialog>

    <!-- Discard changes confirmation -->
    <LDialog
        v-model:open="showDiscardModal"
        context="danger"
        title="Discard changes?"
        description="You have unsaved changes. If you close now, your changes will be discarded."
        primary-button-text="Discard changes"
        secondary-button-text="Keep editing"
        :primary-action="discardAndClose"
        :secondary-action="() => (showDiscardModal = false)"
        :show-closing-button="false"
    />

    <!-- Delete confirmation -->
    <LDialog
        v-model:open="showDeleteModal"
        title="Delete mapping?"
        description="Are you sure you want to delete this auto group mapping? This action cannot be undone."
        :primaryAction="
            () => {
                showDeleteModal = false;
                handleDelete();
            }
        "
        :secondaryAction="() => (showDeleteModal = false)"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        context="danger"
        :showClosingButton="false"
    />
</template>
