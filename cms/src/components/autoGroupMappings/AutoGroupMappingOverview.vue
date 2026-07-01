<script setup lang="ts">
import { AckStatus, type AutoGroupMappingsDto } from "luminary-shared";
import BasePage from "../BasePage.vue";
import AutoGroupMappingDisplayCard from "./AutoGroupMappingDisplayCard.vue";
import CreateOrEditAutoGroupMappingModal from "./CreateOrEditAutoGroupMappingModal.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import {
    ExclamationCircleIcon,
    KeyIcon,
    UserGroupIcon,
    ArrowUturnLeftIcon,
    AdjustmentsVerticalIcon,
    MagnifyingGlassIcon,
} from "@heroicons/vue/24/outline";
import { computed, reactive, ref } from "vue";
import LButton from "../button/LButton.vue";
import LInput from "../forms/LInput.vue";
import LSelect from "../forms/LSelect.vue";
import LCombobox from "../forms/LCombobox.vue";
import LModal from "../modals/LModal.vue";
import LTag from "../content/LTag.vue";
import { isSmallScreen } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import { useAutoGroupMappings } from "@/composables/useAutoGroupMappings";
import EmptyState from "@/components/EmptyState.vue";

const notification = useNotificationStore();

// Data layer: HybridQuery (mappings API-only + providers Dexie-first) + toEditable, plus the
// create/update/delete primitives. See useAutoGroupMappings for the API-only rationale.
// `reactive` unwraps the composable's refs so members are read via dot notation (no `.value`).
const autoGroupMappings = reactive(useAutoGroupMappings());

// ── Filter state ────────────────────────────────────────────────────────────

const searchQuery = ref("");
const selectedProviderFilter = ref<string>("");
const selectedGroupFilter = ref<string[]>([]);
const showMobileFilters = ref(false);

const GLOBAL_FILTER = "__global__";

const providerFilterOptions = computed(() => [
    { value: "", label: "All providers" },
    { value: GLOBAL_FILTER, label: "Global (All Users)" },
    ...autoGroupMappings.providers.map((p) => ({
        value: p._id,
        label: p.displayName || p.label || p.domain || p._id,
    })),
]);

const groupFilterOptions = computed(() =>
    autoGroupMappings.groups.map((g) => ({
        id: g._id,
        label: g.name,
        value: g._id,
    })),
);

const filteredMappings = computed(() => {
    let result = autoGroupMappings.mappings;
    if (selectedProviderFilter.value === GLOBAL_FILTER) {
        result = result.filter((m) => !m.providerId);
    } else if (selectedProviderFilter.value) {
        result = result.filter((m) => m.providerId === selectedProviderFilter.value);
    }
    if (selectedGroupFilter.value.length > 0) {
        result = result.filter((m) =>
            (m.groupIds ?? []).some((gid) => selectedGroupFilter.value.includes(gid)),
        );
    }
    const q = searchQuery.value.trim().toLowerCase();
    if (q) {
        result = result.filter((m) => {
            const pName = providerName(m.providerId).toLowerCase();
            const desc = (m.description ?? "").toLowerCase();
            const groupNames = (m.groupIds ?? [])
                .map((gid) => autoGroupMappings.groups.find((g) => g._id === gid)?.name ?? "")
                .join(" ")
                .toLowerCase();
            return pName.includes(q) || desc.includes(q) || groupNames.includes(q);
        });
    }
    return result;
});

function providerName(providerId: string | undefined): string {
    if (!providerId) return "(no provider)";
    const p = autoGroupMappings.providers.find((prov) => prov._id === providerId);
    return p?.displayName || p?.label || p?.domain || providerId;
}

function resetFilters() {
    searchQuery.value = "";
    selectedProviderFilter.value = "";
    selectedGroupFilter.value = [];
}

// ── Modal state ──────────────────────────────────────────────────────────────

const isModalVisible = ref(false);
const editingMapping = ref<AutoGroupMappingsDto | undefined>(undefined);

function openCreate() {
    editingMapping.value = undefined;
    isModalVisible.value = true;
}

function openEdit(mapping: AutoGroupMappingsDto) {
    editingMapping.value = mapping;
    isModalVisible.value = true;
}

function closeModal() {
    isModalVisible.value = false;
    editingMapping.value = undefined;
}

async function handleSave(doc: AutoGroupMappingsDto) {
    const existing = autoGroupMappings.mappings.some((m) => m._id === doc._id);
    const res = await autoGroupMappings.saveMapping(doc);
    if (res && res.ack === AckStatus.Rejected) {
        notification.addNotification({
            title: existing ? "Failed to save" : "Failed to create",
            description:
                res.message ||
                (existing ? "The server rejected the update." : "The server rejected the creation."),
            state: "error",
        });
        return;
    }

    // Update editingMapping so the modal re-syncs with the saved state
    // (re-clones and re-snapshots via its props.mapping watcher)
    editingMapping.value = { ...doc };

    notification.addNotification({
        title: existing ? "Mapping updated" : "Mapping created",
        description: existing
            ? "The auto group mapping has been updated."
            : "The auto group mapping has been created.",
        state: "success",
    });
}

async function handleDelete(mappingId: string) {
    const res = await autoGroupMappings.deleteMapping(mappingId);
    if (res && res.ack === AckStatus.Rejected) {
        notification.addNotification({
            title: "Failed to delete",
            description: res.message || "The server rejected the update.",
            state: "error",
        });
        return;
    }

    notification.addNotification({
        title: "Mapping deleted",
        description: "The auto group mapping has been deleted.",
        state: "success",
    });
    closeModal();
}

const emptyStateDescription = computed(() =>
    autoGroupMappings.canEdit
        ? "Click Create mapping to assign groups automatically based on JWT claims."
        : "No mappings have been configured yet.",
);

const hasAnyContent = computed(() => autoGroupMappings.mappings.length > 0);

// No explicit teardown: useAutoGroupMappings' HybridQuery / useDexieLiveQuery register
// onScopeDispose in this component's scope and tear down automatically on unmount.
</script>

<template>
    <BasePage
        title="Auto Group Mappings"
        :should-show-page-title="false"
        :loading="autoGroupMappings.isLoading"
    >
        <template #topBarActionsDesktop>
            <LButton
                v-if="autoGroupMappings.canEdit && hasAnyContent && !isSmallScreen"
                variant="primary"
                :icon="PlusIcon"
                @click="openCreate"
            >
                Create mapping
            </LButton>
        </template>
        <template #topBarActionsMobile>
            <PlusIcon
                v-if="autoGroupMappings.canEdit && hasAnyContent && isSmallScreen"
                class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                @click="openCreate"
            />
        </template>

        <template v-if="hasAnyContent" #internalPageHeader>
            <!-- Desktop filter bar -->
            <div
                v-if="!isSmallScreen"
                class="flex flex-col gap-1 overflow-visible"
            >
                <div class="flex h-10 w-full items-center gap-1">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="h-full min-w-0 flex-grow"
                        name="search"
                        placeholder="Search..."
                        v-model="searchQuery"
                        :full-height="true"
                    />
                    <div class="relative flex h-full items-center gap-1">
                        <LSelect
                            v-model="selectedProviderFilter"
                            :options="providerFilterOptions"
                            :icon="KeyIcon"
                        />

                        <LCombobox
                            :options="groupFilterOptions"
                            v-model:selected-options="selectedGroupFilter"
                            :show-selected-in-dropdown="false"
                            :showSelectedLabels="false"
                            :icon="UserGroupIcon"
                        />

                        <LButton @click="resetFilters" class="h-full w-10">
                            <ArrowUturnLeftIcon class="h-4 w-4" />
                        </LButton>
                    </div>
                </div>

                <!-- Selected group filter tags -->
                <div
                    v-if="selectedGroupFilter.length > 0"
                    class="mb-2 flex w-full flex-col gap-1"
                >
                    <div class="w-full">
                        <ul class="flex w-full flex-wrap gap-2">
                            <LTag
                                :icon="UserGroupIcon"
                                v-for="groupId in selectedGroupFilter"
                                :key="groupId"
                                @remove="
                                    () => {
                                        selectedGroupFilter = selectedGroupFilter.filter(
                                            (v) => v !== groupId,
                                        );
                                    }
                                "
                            >
                                {{ autoGroupMappings.groups.find((g) => g._id === groupId)?.name }}
                            </LTag>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Mobile filter bar -->
            <div
                v-else
                class="z-20 flex flex-col gap-1 overflow-visible"
            >
                <div class="flex h-10 w-full items-center gap-1">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="h-full min-w-0 flex-grow"
                        name="search"
                        placeholder="Search..."
                        v-model="searchQuery"
                        :full-height="true"
                    />
                    <LButton class="h-full" :icon="AdjustmentsVerticalIcon" @click="showMobileFilters = true" />
                    <LButton class="h-full w-10" :icon="ArrowUturnLeftIcon" @click="resetFilters" />
                </div>

                <!-- Selected group filter tags (mobile) -->
                <div v-if="selectedGroupFilter.length > 0" class="flex w-full flex-col gap-1">
                    <div class="w-full">
                        <ul class="flex w-full flex-wrap gap-2">
                            <LTag
                                :icon="UserGroupIcon"
                                v-for="groupId in selectedGroupFilter"
                                :key="groupId"
                                @remove="
                                    () => {
                                        selectedGroupFilter = selectedGroupFilter.filter(
                                            (v) => v !== groupId,
                                        );
                                    }
                                "
                            >
                                {{ autoGroupMappings.groups.find((g) => g._id === groupId)?.name }}
                            </LTag>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Mobile filter modal -->
            <LModal heading="Filter options" v-model:is-visible="showMobileFilters">
                <div class="flex flex-col gap-2">
                    <LSelect
                        label="Auth Provider"
                        v-model="selectedProviderFilter"
                        :options="providerFilterOptions"
                        :icon="KeyIcon"
                    />
                    <LCombobox
                        label="Assigned Groups"
                        :options="groupFilterOptions"
                        v-model:selected-options="selectedGroupFilter"
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="false"
                        :icon="UserGroupIcon"
                    />
                </div>
                <template #footer>
                    <LButton
                        variant="primary"
                        class="mt-2 w-full"
                        @click="showMobileFilters = false"
                    >
                        Close
                    </LButton>
                </template>
            </LModal>
        </template>

        <!-- Permission warnings -->
        <div v-if="!autoGroupMappings.canView || !autoGroupMappings.canEdit" class="mb-1">
            <span v-if="!autoGroupMappings.canView" class="mb-1 flex gap-1 text-xs text-zinc-600">
                <ExclamationCircleIcon class="h-4 min-h-4 w-4 min-w-4 text-red-400" />
                No view permission
            </span>
            <span v-if="!autoGroupMappings.canEdit" class="flex gap-1 text-xs text-zinc-600">
                <ExclamationCircleIcon class="h-4 min-h-4 w-4 min-w-4 text-red-400" />
                No edit permission
            </span>
        </div>

        <EmptyState
            v-if="!autoGroupMappings.isLoading && !hasAnyContent"
            title="No auto group mappings configured"
            :description="emptyStateDescription"
            :button-text="autoGroupMappings.canEdit ? 'Create mapping' : undefined"
            :button-action="autoGroupMappings.canEdit ? openCreate : undefined"
            :button-permission="autoGroupMappings.canEdit"
            show-back-button
        />

        <EmptyState
            v-else-if="hasAnyContent && !filteredMappings.length"
            title="No mappings match the current filters"
            description="Try adjusting your search or filter criteria."
        />

        <div v-else-if="filteredMappings.length" class="mt-1 flex flex-col gap-[3px]">
            <AutoGroupMappingDisplayCard
                v-for="mapping in filteredMappings"
                :key="mapping._id"
                :mapping="mapping"
                :groups="autoGroupMappings.groups"
                :provider-name="providerName(mapping.providerId)"
                @click="openEdit(mapping)"
            />
        </div>

        <CreateOrEditAutoGroupMappingModal
            v-if="isModalVisible"
            :is-visible="isModalVisible"
            :mapping="editingMapping"
            :providers="autoGroupMappings.providers"
            :groups="autoGroupMappings.groups"
            :disabled="!autoGroupMappings.canEdit"
            @close="closeModal"
            @save="handleSave"
            @delete="handleDelete"
        />
    </BasePage>
</template>
