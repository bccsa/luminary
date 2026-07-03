<script setup lang="ts">
import { computed, ref } from "vue";
import { Cog6ToothIcon } from "@heroicons/vue/24/outline";
import LButton from "@/components/button/LButton.vue";
import LDropdown from "@/components/common/LDropdown.vue";
import { TREE_MAX_COLUMNS, TREE_MIN_COLUMNS } from "./types";

const layoutDirection = defineModel<"LR" | "TB">("layoutDirection", { required: true });
const treeColumnCount = defineModel<number>("treeColumnCount", { required: true });

withDefaults(defineProps<{ savedLayoutExists?: boolean }>(), { savedLayoutExists: false });

defineEmits<{
    (e: "apply-saved"): void;
    (e: "reset"): void;
    (e: "clear-saved"): void;
}>();

const showColumnDropdown = ref(false);
const isTopToBottom = computed(() => layoutDirection.value === "TB");

function updateTreeColumnCount(event: Event) {
    treeColumnCount.value = Number((event.target as HTMLInputElement).value);
}
</script>

<template>
    <LDropdown
        v-model:show="showColumnDropdown"
        placement="bottom-end"
        width="auto"
        padding="small"
        class="pointer-events-auto shrink-0 sm:hidden"
    >
        <template #trigger>
            <LButton size="sm" variant="secondary" :icon="Cog6ToothIcon" class="h-9 w-9" />
        </template>
        <LButton
            variant="tertiary"
            size="sm"
            role="menuitem"
            class="w-full justify-start"
            @click="
                layoutDirection = isTopToBottom ? 'LR' : 'TB';
                showColumnDropdown = false;
            "
        >
            {{ isTopToBottom ? "Left to right" : "Top to bottom" }}
        </LButton>
        <div class="my-1 border-t border-zinc-100"></div>
        <div class="px-3 py-2">
            <label
                for="group-graph-columns-mobile"
                class="mb-2 flex items-center justify-between gap-4 text-xs font-semibold uppercase tracking-wide text-zinc-500"
            >
                <span>Tree columns</span>
                <span class="text-zinc-700">{{ treeColumnCount }}</span>
            </label>
            <input
                id="group-graph-columns-mobile"
                type="range"
                :min="TREE_MIN_COLUMNS"
                :max="TREE_MAX_COLUMNS"
                step="1"
                :value="treeColumnCount"
                class="h-2 w-40 cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-zinc-700"
                @input="updateTreeColumnCount"
            />
        </div>
        <div class="my-1 border-t border-zinc-100"></div>
        <LButton
            v-if="savedLayoutExists"
            variant="tertiary"
            size="sm"
            role="menuitem"
            class="w-full justify-start"
            @click="
                $emit('apply-saved');
                showColumnDropdown = false;
            "
        >
            Use saved layout
        </LButton>
        <LButton
            variant="tertiary"
            size="sm"
            role="menuitem"
            class="w-full justify-start"
            @click="
                $emit('reset');
                showColumnDropdown = false;
            "
        >
            Reset layout
        </LButton>
        <LButton
            v-if="savedLayoutExists"
            variant="tertiary"
            size="sm"
            role="menuitem"
            class="w-full justify-start"
            @click="
                $emit('clear-saved');
                showColumnDropdown = false;
            "
        >
            Clear saved layout
        </LButton>
    </LDropdown>
</template>
