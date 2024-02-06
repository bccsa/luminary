<script setup lang="ts">
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/vue";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { SignalIcon, SignalSlashIcon } from "@heroicons/vue/20/solid";

const store = useSocketConnectionStore();
</script>

<template>
    <Popover class="relative">
        <PopoverButton
            class="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm shadow-sm"
            :class="{
                'bg-green-100 text-green-800': store.isConnected,
                'bg-yellow-100 text-yellow-800': !store.isConnected,
            }"
        >
            <component :is="store.isConnected ? SignalIcon : SignalSlashIcon" class="h-4 w-4" />
            <span class="hidden sm:block">{{ store.isConnected ? "Online" : "Offline" }}</span>
        </PopoverButton>

        <transition
            enter-active-class="transition ease-out duration-100"
            enter-from-class="transform opacity-0 scale-95"
            enter-to-class="transform opacity-100 scale-100"
            leave-active-class="transition ease-in duration-75"
            leave-from-class="transform opacity-100 scale-100"
            leave-to-class="transform opacity-0 scale-95"
        >
            <PopoverPanel
                class="absolute z-10 w-screen max-w-40 -translate-x-1/2 lg:left-0 lg:max-w-72 lg:translate-x-0"
            >
                <div
                    class="mt-2 rounded bg-white px-4 py-3 text-xs shadow-lg ring-1 ring-inset ring-gray-900/5"
                >
                    {{
                        store.isConnected
                            ? "You are online. Any changes you make will be saved online and are immediately visible for other CMS users."
                            : "You are offline. Any changes you make will be saved offline and synced to other CMS users when you go online again."
                    }}
                </div>
            </PopoverPanel>
        </transition>
    </Popover>
</template>
