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
import { XMarkIcon } from "@heroicons/vue/20/solid";
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
 * Pages with a search interaction or filter dimensions too specific to generalize (e.g.
 * ContentOverview's Enter/Esc-driven min-length search, or filters beyond a single group set)
 * can still reuse just the responsive shell: override the `search` slot with their own input and
 * put every filter control — including a page-owned group filter — in `extra-filters` /
 * `extra-filters-mobile`, with their own chip list in `selected-filters`. In that mode the
 * `search` model and the built-in group filter are simply unused.
 */

type FilterOptionsProps = {
    /** Omit (or pass an empty array) to hide the group filter entirely. */
    groups?: GroupDto[];
    searchPlaceholder?: string;
    /** Debounce (ms) before a search keystroke is committed to the `search` model. 0 = immediate. */
    debounceMs?: number;
    /**
     * Trigger-only search: typing never commits to the `search` model; Enter or the Go
     * button commits (min 3 chars), Esc or the clear button resets, and emptying the input
     * auto-clears a committed search. Overrides debounceMs. This is the search behavior
     * the FTS-backed overviews (Users, Redirects) require so keystrokes never fire
     * server-side searches.
     */
    submitSearch?: boolean;
    isSmallScreen?: boolean;
    /** Label shown above the group combobox in the mobile filter modal. */
    groupFilterLabel?: string;
};

const props = withDefaults(defineProps<FilterOptionsProps>(), {
    groups: () => [],
    searchPlaceholder: "Search...",
    debounceMs: 0,
    submitSearch: false,
    isSmallScreen: false,
    groupFilterLabel: "Group Membership",
});

const emit = defineEmits<{ reset: [] }>();

// Optional — unused when a page supplies its own `#search` slot content instead.
const search = defineModel<string>("search", { default: "" });
const selectedGroups = defineModel<string[]>("selectedGroups", { default: () => [] });

const showGroupFilter = computed(() => props.groups.length > 0);

// Typed-but-not-yet-committed value, so the input never lags while the user types even when
// debounceMs is set. Kept in sync with the `search` model in both directions (an external reset
// of the model, e.g. the parent's own reset handler clearing extra fields, must reflect here too).
const searchInput = ref(search.value ?? "");
watch(search, (v) => {
    if (v !== searchInput.value) searchInput.value = v ?? "";
});
if (props.submitSearch) {
    // Trigger-only: nothing commits while typing, but emptying the input clears an
    // active search so the overview falls back to browsing.
    watch(searchInput, (v) => {
        if (!v && search.value) search.value = "";
    });
} else if (props.debounceMs > 0) {
    debouncedWatch(searchInput, () => (search.value = searchInput.value), {
        debounce: props.debounceMs,
    });
} else {
    watch(searchInput, (v) => (search.value = v));
}

const SEARCH_MIN_CHARS = 3;
const canSubmitSearch = computed(
    () => props.submitSearch && searchInput.value.length >= SEARCH_MIN_CHARS,
);
const showClearSearch = computed(
    () => props.submitSearch && (searchInput.value.length >= SEARCH_MIN_CHARS || !!search.value),
);

function commitSearch() {
    if (canSubmitSearch.value) search.value = searchInput.value;
}

function clearSearch() {
    searchInput.value = "";
    search.value = "";
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
            <slot name="search" :is-small-screen="isSmallScreen">
                <LInput
                    type="text"
                    :icon="MagnifyingGlassIcon"
                    class="h-full min-w-0 flex-grow"
                    name="search"
                    :placeholder="searchPlaceholder"
                    data-test="search-input"
                    v-model="searchInput"
                    :full-height="true"
                    @keydown.enter="commitSearch"
                    @keydown.esc="clearSearch"
                >
                    <template v-if="submitSearch" #searchButton>
                        <div class="flex items-center gap-1">
                            <button
                                v-if="canSubmitSearch"
                                type="button"
                                class="rounded-md bg-white px-2 py-1 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
                                data-test="search-go-button"
                                @click="commitSearch"
                            >
                                Go
                            </button>
                            <button
                                v-if="showClearSearch"
                                type="button"
                                aria-label="Clear search"
                                data-test="search-clear-button"
                                @click="clearSearch"
                            >
                                <XMarkIcon class="h-5 w-5 cursor-pointer text-zinc-500" />
                            </button>
                        </div>
                    </template>
                </LInput>
            </slot>

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

        <!-- Page-owned chip list (e.g. ContentOverview's tags + groups), for pages that don't use
             the built-in group filter above. -->
        <slot name="selected-filters" />
    </div>

    <LModal v-if="isSmallScreen" heading="Filter options" v-model:is-visible="showMobileFilters">
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
