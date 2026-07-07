<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { debouncedWatch } from "@vueuse/core";
import { type GroupDto } from "luminary-shared";
import {
    MagnifyingGlassIcon,
    UserGroupIcon,
    ArrowUturnLeftIcon,
    AdjustmentsVerticalIcon,
} from "@heroicons/vue/24/outline";
import LInput from "@/components/forms/LInput.vue";
import LCombobox from "@/components/forms/LCombobox.vue";
import LButton from "@/components/button/LButton.vue";
import LModal from "@/components/modals/LModal.vue";
import LTag from "@/components/content/LTag.vue";
import { groupLabel } from "@/util/groups";

/**
 * Shared filter bar for overview pages: a search box, an optional group multi-select with
 * removable tag chips, and a slot for page-specific extra filters (e.g. AutoGroupMappingOverview's
 * auth-provider select). Renders a single-row desktop layout or a mobile layout that tucks
 * everything but search behind an "Adjustments" button opening a modal — driven by isSmallScreen
 * rather than separate Mobile/Desktop components, since the two layouts share all their state.
 *
 * Not a fit for ContentOverview, which has enough extra dimensions (status, translation, tags,
 * sort, a min-length "Go"-button search) to warrant its own dedicated FilterOptions.
 */

type FilterOptionsProps = {
    /** Omit (or pass an empty array) to hide the group filter entirely. */
    groups?: GroupDto[];
    searchPlaceholder?: string;
    /** Debounce (ms) before a search keystroke is committed to the `search` model. 0 = immediate. */
    debounceMs?: number;
    isSmallScreen?: boolean;
    /** Label shown above the group combobox in the mobile filter modal. */
    groupFilterLabel?: string;
};

const props = withDefaults(defineProps<FilterOptionsProps>(), {
    groups: () => [],
    searchPlaceholder: "Search...",
    debounceMs: 0,
    isSmallScreen: false,
    groupFilterLabel: "Group Membership",
});

const emit = defineEmits<{ reset: [] }>();

const search = defineModel<string>("search", { required: true });
const selectedGroups = defineModel<string[]>("selectedGroups", { default: () => [] });

const showGroupFilter = computed(() => props.groups.length > 0);

// Typed-but-not-yet-committed value, so the input never lags while the user types even when
// debounceMs is set. Kept in sync with the `search` model in both directions (an external reset
// of the model, e.g. the parent's own reset handler clearing extra fields, must reflect here too).
const searchInput = ref(search.value ?? "");
watch(search, (v) => {
    if (v !== searchInput.value) searchInput.value = v ?? "";
});
if (props.debounceMs > 0) {
    debouncedWatch(searchInput, () => (search.value = searchInput.value), {
        debounce: props.debounceMs,
    });
} else {
    watch(searchInput, (v) => (search.value = v));
}

const groupOptions = computed(() =>
    props.groups.map((g) => ({ id: g._id, label: g.name, value: g._id })),
);

function removeGroup(groupId: string) {
    selectedGroups.value = selectedGroups.value.filter((id) => id !== groupId);
}

const showMobileFilters = ref(false);

function handleReset() {
    searchInput.value = "";
    selectedGroups.value = [];
    emit("reset");
}
</script>

<template>
    <div class="relative z-20 flex flex-col gap-1 overflow-visible">
        <div class="flex h-10 w-full items-center gap-1">
            <LInput
                type="text"
                :icon="MagnifyingGlassIcon"
                class="h-full min-w-0 flex-grow"
                name="search"
                :placeholder="searchPlaceholder"
                data-test="search-input"
                v-model="searchInput"
                :full-height="true"
            />

            <template v-if="!isSmallScreen">
                <div class="relative flex h-full items-center gap-1">
                    <slot name="extra-filters" />
                    <LCombobox
                        v-if="showGroupFilter"
                        :options="groupOptions"
                        v-model:selected-options="selectedGroups"
                        :show-selected-in-dropdown="false"
                        :showSelectedLabels="false"
                        :icon="UserGroupIcon"
                    />
                    <LButton @click="handleReset" class="h-full w-10" data-test="reset-filters">
                        <ArrowUturnLeftIcon class="h-4 w-4" />
                    </LButton>
                </div>
            </template>
            <template v-else>
                <LButton
                    class="h-full"
                    :icon="AdjustmentsVerticalIcon"
                    data-test="open-mobile-filters"
                    @click="showMobileFilters = true"
                />
                <LButton
                    class="h-full w-10"
                    :icon="ArrowUturnLeftIcon"
                    data-test="reset-filters"
                    @click="handleReset"
                />
            </template>
        </div>

        <!-- Selected group filter tags -->
        <div v-if="selectedGroups.length > 0" class="flex w-full flex-col gap-1">
            <ul class="flex w-full flex-wrap gap-2">
                <LTag
                    :icon="UserGroupIcon"
                    v-for="groupId in selectedGroups"
                    :key="groupId"
                    @remove="removeGroup(groupId)"
                >
                    {{ groupLabel(groupId, groups) }}
                </LTag>
            </ul>
        </div>
    </div>

    <LModal
        v-if="isSmallScreen"
        heading="Filter options"
        v-model:is-visible="showMobileFilters"
    >
        <div class="flex flex-col gap-2">
            <slot name="extra-filters-mobile">
                <slot name="extra-filters" />
            </slot>
            <LCombobox
                v-if="showGroupFilter"
                :label="groupFilterLabel"
                :options="groupOptions"
                v-model:selected-options="selectedGroups"
                :show-selected-in-dropdown="false"
                :showSelectedLabels="false"
                :icon="UserGroupIcon"
            />
        </div>
        <template #footer>
            <LButton variant="primary" class="mt-2 w-full" @click="showMobileFilters = false">
                Close
            </LButton>
        </template>
    </LModal>
</template>
