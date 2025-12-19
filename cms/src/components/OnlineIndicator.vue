<script setup lang="ts">
import { SignalIcon, SignalSlashIcon } from "@heroicons/vue/20/solid";
import { ref } from "vue";
import LDropdown from "@/components/common/LDropdown.vue";
import { isConnected } from "luminary-shared";

const open = ref(false);
</script>

<template>
    <div class="relative">
        <LDropdown v-model:show="open" placement="top-center" width="auto">
            <template #trigger>
                <button
                    class="mt-2 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm shadow-sm"
                    :class="{
                        'bg-green-100 text-green-800': isConnected,
                        'bg-yellow-100 text-yellow-800': !isConnected,
                    }"
                >
                    <component :is="isConnected ? SignalIcon : SignalSlashIcon" class="h-4 w-4" />
                    <span class="block">{{ isConnected ? "Connected" : "Disconnected" }}</span>
                </button>
            </template>
            <div class="w-36 px-2 py-1 text-xs lg:max-w-72">
                {{
                    isConnected
                        ? "You are online. Any changes you make will be saved online and are immediately visible for other CMS users."
                        : "You are offline. Any changes you make will be saved offline and synced to other CMS users when you go online again."
                }}
            </div>
        </LDropdown>
    </div>
</template>
