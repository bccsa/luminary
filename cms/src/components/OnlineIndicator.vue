<script setup lang="ts">
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/vue";
import { SignalIcon, SignalSlashIcon } from "@heroicons/vue/20/solid";
import { isConnected } from "luminary-shared";
</script>

<template>
    <Popover class="relative">
        <PopoverButton
            class="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm shadow-sm"
            :class="{
                'bg-green-100 text-green-800': isConnected,
                'bg-yellow-100 text-yellow-800': !isConnected,
            }"
        >
            <component :is="isConnected ? SignalIcon : SignalSlashIcon" class="h-4 w-4" />
            <span class="block">{{ isConnected ? "Connected" : "Disconnected" }}</span>
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
                class="absolute bottom-full left-1/2 z-10 mb-2 w-40 max-w-40 origin-bottom -translate-x-1/2 lg:max-w-72"
            >
                <div
                    class="rounded-md bg-white px-4 py-3 text-xs shadow-lg ring-1 ring-inset ring-zinc-900/5"
                >
                    {{
                        isConnected
                            ? "You are online. Any changes you make will be saved online and are immediately visible for other CMS users."
                            : "You are offline. Any changes you make will be saved offline and synced to other CMS users when you go online again."
                    }}
                </div>
            </PopoverPanel>
        </transition>
    </Popover>
</template>
