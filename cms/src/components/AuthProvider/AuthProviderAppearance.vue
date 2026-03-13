<script setup lang="ts">
import LInput from "../forms/LInput.vue";

defineProps<{
    textColor: string | undefined;
    backgroundColor: string | undefined;
    disabled?: boolean;
}>();

const emit = defineEmits<{
    "update:textColor": [value: string];
    "update:backgroundColor": [value: string];
}>();
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
                            :value="textColor || '#000000'"
                            @input="
                                emit(
                                    'update:textColor',
                                    ($event.target as HTMLInputElement).value,
                                )
                            "
                            class="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
                            :disabled="disabled"
                        />
                        <div
                            class="h-full w-full"
                            :style="{
                                backgroundColor: textColor || '#000000',
                            }"
                        ></div>
                    </div>
                    <LInput
                        id="textColor"
                        name="textColor"
                        :model-value="textColor ?? ''"
                        type="text"
                        placeholder="#000000"
                        :disabled="disabled"
                        @update:model-value="emit('update:textColor', $event)"
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
                            :value="backgroundColor || '#ffffff'"
                            @input="
                                emit(
                                    'update:backgroundColor',
                                    ($event.target as HTMLInputElement).value,
                                )
                            "
                            class="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
                            :disabled="disabled"
                        />
                        <div
                            class="h-full w-full"
                            :style="{
                                backgroundColor:
                                    backgroundColor || '#ffffff',
                            }"
                        ></div>
                    </div>
                    <LInput
                        id="backgroundColor"
                        name="backgroundColor"
                        :model-value="backgroundColor ?? ''"
                        type="text"
                        placeholder="#FFFFFF"
                        :disabled="disabled"
                        @update:model-value="emit('update:backgroundColor', $event)"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
