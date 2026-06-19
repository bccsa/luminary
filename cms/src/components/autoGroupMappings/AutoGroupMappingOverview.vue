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
import { computed, ref } from "vue";
import LButton from "../button/LButton.vue";
import LInput from "../forms/LInput.vue";
import LSelect from "../forms/LSelect.vue";
import LCombobox from "../forms/LCombobox.vue";
import LModal from "../modals/LModal.vue";
import LTag from "../content/LTag.vue";
import { isSmallScreen } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import { useAutoGroupMappings } from "@/composables/useAutoGroupMappings";

const notification = useNotificationStore();

// Data layer: HybridQuery (mappings API-only + providers Dexie-first) + toEditable, plus the
// create/update/delete primitives. See useAutoGroupMappings for the API-only rationale.
const { canView, canEdit, mappings, providers, groups, isLoading, saveMapping, deleteMapping } =
    useAutoGroupMappings();

// ── Filter state ────────────────────────────────────────────────────────────

const searchQuery = ref("");
const selectedProviderFilter = ref<string>("");
const selectedGroupFilter = ref<string[]>([]);
const showMobileFilters = ref(false);

const GLOBAL_FILTER = "__global__";

const providerFilterOptions = computed(() => [
    { value: "", label: "All providers" },
    { value: GLOBAL_FILTER, label: "Global (All Users)" },
    ...providers.value.map((p) => ({
        value: p._id,
        label: p.displayName || p.label || p.domain || p._id,
    })),
]);

const groupFilterOptions = computed(() =>
    groups.value.map((g) => ({
        id: g._id,
        label: g.name,
        value: g._id,
    })),
);

const filteredMappings = computed(() => {
    let result = mappings.value;
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
                .map((gid) => groups.value.find((g) => g._id === gid)?.name ?? "")
                .join(" ")
                .toLowerCase();
            return pName.includes(q) || desc.includes(q) || groupNames.includes(q);
        });
    }
    return result;
});

function providerName(providerId: string | undefined): string {
    if (!providerId) return "(no provider)";
    const p = providers.value.find((prov) => prov._id === providerId);
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
    const existing = mappings.value.some((m) => m._id === doc._id);
    const res = await saveMapping(doc);
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
    const res = await deleteMapping(mappingId);
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

// No explicit teardown: useAutoGroupMappings' HybridQuery / useDexieLiveQuery register
// onScopeDispose in this component's scope and tear down automatically on unmount.
</script>

<template>
    <BasePage title="Auto Group Mappings" :should-show-page-title="false" :loading="isLoading">
        <template #pageNav>
            <div class="flex items-center gap-3" v-if="canEdit">
                <LButton
                    v-if="!isSmallScreen"
                    variant="primary"
                    :icon="PlusIcon"
                    @click="openCreate"
                >
                    Create mapping
                </LButton>
                <PlusIcon
                    v-else
                    class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                    @click="openCreate"
                />
            </div>
        </template>

        <template #internalPageHeader>
            <!-- Desktop filter bar -->
            <div
                v-if="!isSmallScreen"
                class="flex flex-col gap-1 overflow-visible border-b border-t border-zinc-300 border-t-zinc-100 bg-white pb-1 pt-2 shadow"
            >
                <div class="flex h-10 w-full items-center gap-1 px-8">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="h-full flex-grow"
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
                    class="mb-2 ml-8 flex w-full flex-col gap-1"
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
                                {{ groups.find((g) => g._id === groupId)?.name }}
                            </LTag>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Mobile filter bar -->
            <div
                v-else
                class="z-20 flex flex-col gap-1 overflow-visible border-b border-t border-zinc-300 border-t-zinc-100 bg-white pb-1 pt-2 shadow max-sm:px-1 sm:px-4"
            >
                <div class="flex gap-1">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="flex-grow"
                        name="search"
                        placeholder="Search..."
                        v-model="searchQuery"
                        :full-height="true"
                    />
                    <LButton :icon="AdjustmentsVerticalIcon" @click="showMobileFilters = true" />
                    <LButton :icon="ArrowUturnLeftIcon" @click="resetFilters" />
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
                                {{ groups.find((g) => g._id === groupId)?.name }}
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
        <div v-if="!canView || !canEdit" class="mb-1 p-2">
            <span v-if="!canView" class="mb-1 flex gap-1 text-xs text-zinc-600">
                <ExclamationCircleIcon class="h-4 min-h-4 w-4 min-w-4 text-red-400" />
                No view permission
            </span>
            <span v-if="!canEdit" class="flex gap-1 text-xs text-zinc-600">
                <ExclamationCircleIcon class="h-4 min-h-4 w-4 min-w-4 text-red-400" />
                No edit permission
            </span>
        </div>

        <!-- Mapping list -->
        <p v-if="!filteredMappings.length" class="mt-1 text-sm italic text-gray-400">
            No auto group mappings configured.
            <template v-if="canEdit">
                Click "Create mapping" to assign groups automatically based on JWT claims.
            </template>
        </p>

        <div class="mt-1">
            <AutoGroupMappingDisplayCard
                v-for="mapping in filteredMappings"
                :key="mapping._id"
                :mapping="mapping"
                :groups="groups"
                :provider-name="providerName(mapping.providerId)"
                @click="openEdit(mapping)"
            />
        </div>

        <CreateOrEditAutoGroupMappingModal
            v-if="isModalVisible"
            :is-visible="isModalVisible"
            :mapping="editingMapping"
            :providers="providers"
            :groups="groups"
            :disabled="!canEdit"
            @close="closeModal"
            @save="handleSave"
            @delete="handleDelete"
        />
    </BasePage>
</template>
