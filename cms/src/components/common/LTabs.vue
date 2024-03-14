<script setup lang="ts">
import { useId } from "@/util/useId";
import type { Component } from "vue";

type Tab = {
    title: string;
    key: string;
    icon?: Component | Function | string;
};

type Props = {
    tabs: Tab[];
    currentTab: string;
};

defineProps<Props>();

const emit = defineEmits(["update:currentTab"]);

const id = useId().toString();
</script>

<template>
    <div>
        <div class="sm:hidden">
            <label :for="id" class="sr-only">Select a tab</label>
            <select
                :id="id"
                name="tabs"
                class="block w-full rounded-md border-zinc-300 py-2 pl-3 pr-10 text-base focus:border-zinc-500 focus:outline-none focus:ring-zinc-500 sm:text-sm"
            >
                <option
                    v-for="tab in tabs"
                    :key="tab.key"
                    :selected="tab.key == currentTab"
                    @click="emit('update:currentTab', tab.key)"
                >
                    {{ tab.title }}
                </option>
            </select>
        </div>
        <div>
            <div class="flex items-center justify-between sm:border-b sm:border-zinc-200">
                <nav class="-mb-px hidden space-x-8 sm:flex" aria-label="Tabs">
                    <span
                        v-for="tab in tabs"
                        @click="emit('update:currentTab', tab.key)"
                        :key="tab.key"
                        :class="[
                            tab.key == currentTab
                                ? 'border-zinc-500 text-zinc-950'
                                : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700',
                            'flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium',
                        ]"
                        :aria-current="tab.key == currentTab ? 'page' : undefined"
                    >
                        <component
                            :is="tab.icon"
                            v-if="tab.icon"
                            class="h-4 w-4"
                            :class="[tab.key == currentTab ? 'text-zinc-800' : 'text-zinc-400']"
                        />
                        {{ tab.title }}
                    </span>
                </nav>
                <div class="mt-3 sm:mt-0" v-if="$slots.default"><slot /></div>
            </div>
        </div>
        <div>
            <slot :name="`tab-${index + 1}`" v-for="(tab, index) in tabs" />
        </div>
    </div>
</template>
