<script setup lang="ts">
import LButton from "../button/LButton.vue";
import LInput from "../forms/LInput.vue";

type ClaimMapping = { claim: string; target: string };

const props = defineProps<{
    modelValue: ClaimMapping[] | undefined;
    disabled?: boolean;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: ClaimMapping[]];
}>();

const mappings = () => props.modelValue ?? [];

function addClaimMapping() {
    emit("update:modelValue", [...mappings(), { claim: "", target: "groups" }]);
}

function removeClaimMapping(idx: number) {
    const list = mappings();
    if (idx < 0 || idx >= list.length) return;
    const next = list.slice();
    next.splice(idx, 1);
    emit("update:modelValue", next);
}

function updateMapping(idx: number, field: "claim" | "target", value: string) {
    const list = mappings().slice();
    if (idx < 0 || idx >= list.length) return;
    list[idx] = { ...list[idx], [field]: value };
    emit("update:modelValue", list);
}
</script>

<template>
    <div class="rounded-md border border-zinc-200 bg-white p-2">
        <div class="mb-1 flex items-center justify-between">
            <label class="block text-xs font-medium text-gray-700"> Claim Mappings </label>
            <LButton size="sm" variant="tertiary" :disabled="disabled" @click="addClaimMapping">
                + Add
            </LButton>
        </div>
        <p class="mb-2 text-[11px] text-gray-500">
            Map JWT claim fields to system concepts (e.g. map a "hasMembership" claim to "groups")
        </p>
        <div
            v-for="(mapping, idx) in modelValue ?? []"
            :key="idx"
            class="mb-2 flex items-center gap-2"
        >
            <LInput
                :name="`claimMapping-claim-${idx}`"
                :model-value="mapping.claim"
                type="text"
                placeholder="groups"
                :disabled="disabled"
                class="flex-1"
                @update:model-value="updateMapping(idx, 'claim', $event)"
            />
            <span class="text-xs text-gray-400">→</span>
            <select
                :value="mapping.target"
                :disabled="disabled"
                class="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
                @change="updateMapping(idx, 'target', ($event.target as HTMLSelectElement).value)"
            >
                <option value="groups">groups</option>
            </select>
            <button
                type="button"
                class="text-gray-400 hover:text-red-500"
                :disabled="disabled"
                @click="removeClaimMapping(idx)"
            >
                ✕
            </button>
        </div>
    </div>
</template>
