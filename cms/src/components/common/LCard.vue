<script setup lang="ts">
import { ref, type Component } from "vue";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/vue/20/solid";

type Tab = {
    title: string;
    content: string | Component;
};

type Props = {
    title?: string;
    icon?: string | Component | Function;
    padding?: "none" | "normal";
    collapsible?: boolean;
    tabs?: Tab[];
};

const props = withDefaults(defineProps<Props>(), {
    padding: "normal",
    collapsible: false,
});

const collapsed = ref(false);
const activeTab = ref(0);

function collapse() {
    if (!props.collapsible) {
        return;
    }
    collapsed.value = !collapsed.value;
}

function switchTab(index: number) {
    activeTab.value = index;
}
</script>

<template>
    <div class="rounded-md border border-zinc-100 bg-white shadow">
        <div
            v-if="title || icon"
            :class="[
                'flex items-center justify-between gap-4 px-4 pt-5 sm:px-6',
                { 'cursor-pointer': collapsible, 'pb-5': collapsed },
            ]"
            @click="collapse"
        >
            <div class="flex items-center gap-2">
                <component v-if="icon" :is="icon" class="h-4 w-4 text-zinc-600" />
                <h3 class="text-sm font-semibold leading-6 text-zinc-900">{{ title }}</h3>
            </div>
            <button v-if="collapsible">
                <ChevronDownIcon
                    v-if="collapsed"
                    class="h-5 w-5 text-zinc-600"
                    title="Open card content"
                />
                <ChevronUpIcon
                    v-if="!collapsed"
                    class="h-5 w-5 text-zinc-600"
                    title="Collapse card content"
                />
            </button>
        </div>
        <div v-show="!collapsed" data-test="collapsible-container">
            <!-- Tab Navigation -->
            <div v-if="tabs?.length" class="border-b">
                <nav class="flex space-x-4 px-4 py-2">
                    <button
                        v-for="(tab, index) in tabs"
                        :key="tab.title"
                        @click="switchTab(index)"
                        :class="{
                            'border-blue-600 text-blue-600': activeTab === index,
                            'border-transparent text-gray-500': activeTab !== index,
                        }"
                        class="border-b-2 px-3 py-2 text-sm font-medium"
                    >
                        {{ tab.title }}
                    </button>
                </nav>
            </div>
            <!-- Tab Content -->
            <div v-if="tabs?.length" class="p-4">
                <component
                    v-if="typeof tabs[activeTab]?.content !== 'string'"
                    :is="tabs[activeTab]?.content"
                />
                <div v-else v-html="tabs[activeTab]?.content"></div>
            </div>
            <!-- Default Slot Content -->
            <div
                v-else
                :class="{
                    'px-4 py-5 sm:px-6': padding == 'normal',
                    'pt-5': padding == 'none' && title,
                }"
            >
                <slot />
            </div>
            <div v-if="$slots.footer" class="bg-zinc-50 px-4 py-5 sm:px-6">
                <slot name="footer" />
            </div>
        </div>
    </div>
</template>
