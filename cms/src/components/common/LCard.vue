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
    fillHeight?: boolean;
    /**
     * Render without the card chrome (border / shadow / rounding / outer padding) so the
     * card can be nested inside another card as a plain section. The header + slots still
     * render. Used to merge several cards into one (see EditContent's "Basic" card).
     */
    bare?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    shadow: "none",
    padding: "normal",
    collapsible: false,
    defaultCollapsed: false,
    fillHeight: false,
    bare: false,
    blurEffect: false,
});

// Optional v-model:collapsed support. `defineModel` already emits `update:collapsed` on write, so
// it is the single emit source — the redundant `defineEmits` + explicit `emit` are gone (they made
// `update:collapsed` fire twice per toggle).
const modelCollapsed = defineModel<boolean>("collapsed", { default: false });
const collapsed = ref(modelCollapsed?.value ?? props.defaultCollapsed);

// Keep the local state and the (optional) v-model in sync.
watch(modelCollapsed, (newVal) => {
    if (newVal !== undefined) collapsed.value = newVal;
});
watch(collapsed, (newVal) => {
    if (modelCollapsed.value !== undefined) modelCollapsed.value = newVal;
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
        :class="[
            bare
                ? ''
                : 'border-y border-zinc-200 px-2 shadow-zinc-300/60 sm:mx-0 sm:rounded-md sm:border',
            {
                'shadow-none': !bare && props.shadow === 'none',
                'shadow-sm': !bare && props.shadow === 'small',
                'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden': fillHeight,
                'overflow-visible': !fillHeight,
            },
        ]"
    >
        <div
            v-if="title || icon"
            data-test="card-header"
            :class="[
                'flex items-center justify-between gap-4',
                bare ? 'px-0' : 'px-2 sm:px-2',
                // Tighter header when nested as a bare section so it doesn't read as dead
                // space below the divider / above the first field.
                bare ? 'py-1.5' : 'py-3',
                { 'cursor-pointer': collapsible },
            ]"
            @click="collapse"
        >
            <div class="flex items-center gap-1">
                <component v-if="icon" :is="icon" class="h-5 w-5 text-zinc-400" />
                <h3 class="text-sm font-medium leading-6 text-zinc-900">{{ title }}</h3>
            </div>

            <!-- Stop clicks on actions/chevron from bubbling to the header toggle: action buttons
                 must not collapse the card, and the chevron toggles via its own handler. -->
            <div class="flex items-center gap-2" @click.stop>
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

        <div
            v-show="!collapsed"
            data-test="collapsible-container"
            :class="{ 'lg:flex lg:min-h-0 lg:flex-1 lg:flex-col': fillHeight }"
        >
            <div
                :class="[
                    bare && padding == 'normal'
                        ? 'px-0 py-1.5'
                        : padding == 'normal'
                          ? 'px-2 py-1.5'
                          : '',
                    padding == 'none' && title ? (bare ? 'px-0 pt-2' : 'pt-2') : '',
                    fillHeight ? 'lg:min-h-0 lg:flex-1 lg:overflow-y-auto' : '',
                ]"
            >
                <slot />
            </div>
            <div v-if="$slots.footer" class="bg-zinc-50 px-2 py-3">
                <slot name="footer" />
            </div>
        </div>
    </div>
</template>
