<script setup lang="ts">
import { ref, watch, type Component } from "vue";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/vue/20/solid";

type Props = {
    title?: string;
    icon?: string | Component | Function;
    padding?: "none" | "normal";
    shadow?: "none" | "small";
    collapsible?: boolean;
    defaultCollapsed?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    shadow: "none",
    padding: "normal",
    collapsible: false,
    defaultCollapsed: false,
    blurEffect: false,
});

// Optional v-model:collapsed support
const modelCollapsed = defineModel<boolean>("collapsed", { default: false });
const collapsed = ref(modelCollapsed?.value ?? props.defaultCollapsed);

const emit = defineEmits<{
    (e: "update:collapsed", value: boolean): void;
}>();

// Sync v-model if defined
watch(modelCollapsed, (newVal) => {
    if (newVal !== undefined) collapsed.value = newVal;
});
watch(collapsed, (newVal) => {
    if (modelCollapsed.value !== undefined) modelCollapsed.value = newVal;
    emit("update:collapsed", newVal);
});

function collapse() {
    if (!props.collapsible) {
        return;
    }

    collapsed.value = !collapsed.value;
}
</script>

<template>
    <div
        class="overflow-visible border-y-2 border-zinc-200 px-2 shadow-zinc-300/60 sm:mx-0 sm:rounded-md sm:border-2"
        :class="{
            'shadow-none': props.shadow === 'none',
            'shadow-sm': props.shadow === 'small',
            'bg-zinc-50': collapsed,
        }"
    >
        <div
            v-if="title || icon"
            :class="[
                'flex items-center justify-between gap-4 px-2 py-3 sm:px-2',
                { 'cursor-pointer': collapsible },
            ]"
        >
            <div class="flex items-center gap-2">
                <component v-if="icon" :is="icon" class="h-4 w-4 text-zinc-600" />
                <h3 class="text-sm font-semibold leading-6 text-zinc-900">{{ title }}</h3>
            </div>

            <div class="flex items-center gap-2">
                <slot v-if="!collapsed" name="actions" />
                <button @click="collapse" v-if="collapsible" data-test="collapse-button">
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
        </div>

        <slot name="persistent" :collapsed="collapsed" />

        <div v-show="!collapsed" data-test="collapsible-container">
            <div
                :class="{
                    'px-2 py-1.5 sm:px-1': padding == 'normal',
                    'pt-2': padding == 'none' && title,
                }"
            >
                <slot />
            </div>
            <div v-if="$slots.footer" class="bg-zinc-50 px-4 py-3 sm:px-2">
                <slot name="footer" />
            </div>
        </div>
    </div>
</template>
