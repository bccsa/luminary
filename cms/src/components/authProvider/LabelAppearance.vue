<script setup lang="ts">
import type { AuthProviderDto } from "luminary-shared";
import LInput from "../forms/LInput.vue";

defineProps<{
    disabled?: boolean;
}>();

const provider = defineModel<AuthProviderDto>("provider", { required: true });
</script>

<template>
    <div class="rounded-md border border-zinc-200 bg-white p-2">
        <h3 class="mb-2 text-sm font-medium text-gray-900">Appearance</h3>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="mb-1 block text-xs font-medium text-gray-700"
                    >Text Color</label
                >
                <div class="flex items-center gap-2">
                    <div
                        class="relative h-[38px] w-[38px] flex-shrink-0 overflow-hidden rounded-md border border-gray-300"
                    >
                        <input
                            type="color"
                            :value="provider.textColor || '#000000'"
                            @input="provider.textColor = ($event.target as HTMLInputElement).value"
                            class="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
                            :disabled="disabled"
                        />
                        <div
                            class="h-full w-full"
                            :style="{
                                backgroundColor: provider.textColor || '#000000',
                            }"
                        ></div>
                    </div>
                    <LInput
                        id="textColor"
                        name="textColor"
                        :model-value="provider.textColor ?? ''"
                        type="text"
                        placeholder="#000000"
                        :disabled="disabled"
                        @update:model-value="provider.textColor = $event"
                    />
                </div>
            </div>
            <div>
                <label class="mb-1 block text-xs font-medium text-gray-700"
                    >Background Color</label
                >
                <div class="flex items-center gap-2">
                    <div
                        class="relative h-[38px] w-[38px] flex-shrink-0 overflow-hidden rounded-md border border-gray-300"
                    >
                        <input
                            type="color"
                            :value="provider.backgroundColor || '#ffffff'"
                            @input="provider.backgroundColor = ($event.target as HTMLInputElement).value"
                            class="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
                            :disabled="disabled"
                        />
                        <div
                            class="h-full w-full"
                            :style="{
                                backgroundColor: provider.backgroundColor || '#ffffff',
                            }"
                        ></div>
                    </div>
                    <LInput
                        id="backgroundColor"
                        name="backgroundColor"
                        :model-value="provider.backgroundColor ?? ''"
                        type="text"
                        placeholder="#FFFFFF"
                        :disabled="disabled"
                        @update:model-value="provider.backgroundColor = $event"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
