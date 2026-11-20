<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { GroupDto } from "luminary-shared";
import LButton from "@/components/button/LButton.vue";
import LDropdown from "@/components/common/LDropdown.vue";
import LInput from "@/components/forms/LInput.vue";
import { MagnifyingGlassIcon } from "@heroicons/vue/24/outline";

const props = defineProps<{ allGroups: GroupDto[] }>();
const show = defineModel<boolean>("show", { required: true });
const emit = defineEmits<{ (e: "select", groupId: string): void }>();

const searchInput = ref<InstanceType<typeof LInput> | null>(null);
const searchDropdownRef = ref<{ panelRef: HTMLElement | null } | null>(null);
const showSearchDropdown = ref(false);
const searchQuery = ref("");
const activeSearchIndex = ref(0);

const searchResults = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    return [...props.allGroups]
        .filter((group) => !query || group.name.toLowerCase().includes(query))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 8);
});

watch(activeSearchIndex, async () => {
    if (!showSearchDropdown.value) return;
    await nextTick();
    const panel = searchDropdownRef.value?.panelRef;
    if (!panel) return;
    panel
        .querySelectorAll<HTMLElement>('[role="menuitem"]')
        [activeSearchIndex.value]?.scrollIntoView({ block: "nearest" });
});

watch(searchQuery, () => {
    activeSearchIndex.value = 0;
    showSearchDropdown.value = true;
});

watch(show, (open) => {
    if (!open) {
        showSearchDropdown.value = false;
        return;
    }
    showSearchDropdown.value = true;
    searchQuery.value = "";
    activeSearchIndex.value = 0;
    nextTick(() => requestAnimationFrame(() => searchInput.value?.focus()));
});

function openSearchDropdown() {
    showSearchDropdown.value = true;
    nextTick(() => requestAnimationFrame(() => searchInput.value?.focus()));
}

function selectResult(groupId: string) {
    emit("select", groupId);
    show.value = false;
}

function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        event.preventDefault();
        show.value = false;
        return;
    }

    if (event.key === "ArrowDown") {
        event.preventDefault();
        showSearchDropdown.value = true;
        activeSearchIndex.value =
            (activeSearchIndex.value + 1) % Math.max(searchResults.value.length, 1);
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        showSearchDropdown.value = true;
        activeSearchIndex.value =
            (activeSearchIndex.value - 1 + Math.max(searchResults.value.length, 1)) %
            Math.max(searchResults.value.length, 1);
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        const group = searchResults.value[activeSearchIndex.value];
        if (group) selectResult(group._id);
    }
}
</script>

<template>
    <div
        v-if="show"
        class="absolute inset-0 z-[60] flex items-start justify-center bg-white/40 px-4 pt-20 backdrop-blur-[1px] dark:bg-slate-900/40"
        @click.self="show = false"
    >
        <div
            class="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
            <LDropdown
                ref="searchDropdownRef"
                v-model:show="showSearchDropdown"
                placement="bottom-start"
                width="full"
                padding="none"
                class="w-full"
            >
                <template #trigger>
                    <LInput
                        ref="searchInput"
                        v-model="searchQuery"
                        name="group-search"
                        :icon="MagnifyingGlassIcon"
                        placeholder="Search groups..."
                        autocomplete="off"
                        @click.prevent.stop="openSearchDropdown"
                        @focus="openSearchDropdown"
                        @keydown.stop="handleSearchKeydown"
                    />
                </template>
                <LButton
                    v-for="(group, index) in searchResults"
                    :key="group._id"
                    variant="tertiary"
                    size="sm"
                    role="menuitem"
                    class="w-full justify-start"
                    :main-dynamic-css="
                        index === activeSearchIndex
                            ? 'bg-zinc-100 dark:bg-slate-700 dark:text-zinc-100 dark:active:bg-slate-600'
                            : 'dark:hover:bg-slate-700 dark:active:bg-slate-600'
                    "
                    @click="selectResult(group._id)"
                >
                    {{ group.name || "(unnamed group)" }}
                </LButton>
                <div
                    v-if="searchResults.length === 0"
                    class="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                    No groups found
                </div>
            </LDropdown>
        </div>
    </div>
</template>
