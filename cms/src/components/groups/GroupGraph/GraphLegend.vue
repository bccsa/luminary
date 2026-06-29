<script setup lang="ts">
import { ref } from "vue";
import { ExclamationTriangleIcon, InformationCircleIcon } from "@heroicons/vue/24/outline";
import LButton from "@/components/button/LButton.vue";
import LDropdown from "@/components/common/LDropdown.vue";

withDefaults(defineProps<{ showPermissionOptimisationTip?: boolean }>(), {
    showPermissionOptimisationTip: false,
});

const showLegend = ref(false);
</script>

<template>
    <LDropdown
        v-model:show="showLegend"
        placement="bottom-end"
        width="auto"
        padding="none"
        panel-class="!max-h-[calc(100dvh-5rem)]"
        class="pointer-events-auto shrink-0"
    >
        <template #trigger>
            <LButton
                size="sm"
                variant="secondary"
                :icon="
                    showPermissionOptimisationTip ? ExclamationTriangleIcon : InformationCircleIcon
                "
                :main-dynamic-css="
                    showPermissionOptimisationTip
                        ? 'bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100'
                        : ''
                "
                class="h-9 w-9 shadow-md"
                :aria-label="
                    showPermissionOptimisationTip ? 'Large permission path' : 'Visualisation'
                "
            />
        </template>
        <div class="legend-drawer w-[calc(100vw-1.5rem)] px-3 py-2 text-xs sm:w-max sm:max-w-2xl">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="text-sm font-semibold text-zinc-900">Info</div>
                    <div class="mt-0.5 text-zinc-500">
                        Select a group to see who can access it and what it can access.
                    </div>
                </div>
            </div>
            <div class="mt-2 grid gap-4 border-t border-zinc-100 pt-2 sm:grid-cols-2">
                <div class="text-[11px]">
                    <div class="font-bold text-zinc-600">Keys</div>
                    <dl class="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-zinc-500">
                        <dt class="font-medium text-zinc-600">Space</dt>
                        <dd>Hold to drag</dd>
                        <dt class="font-medium text-zinc-600">Middle mouse</dt>
                        <dd>Drag</dd>
                        <dt class="font-medium text-zinc-600">Arrow keys</dt>
                        <dd>Pan</dd>
                        <dt class="font-medium text-zinc-600">+ / -</dt>
                        <dd>Zoom</dd>
                        <dt class="font-medium text-zinc-600">0</dt>
                        <dd>Fit view</dd>
                        <dt class="font-medium text-zinc-600">Tab</dt>
                        <dd>Move through groups</dd>
                        <dt class="font-medium text-zinc-600">Enter / Space</dt>
                        <dd>Select group</dd>
                        <dt class="font-medium text-zinc-600">Esc</dt>
                        <dd>Close or clear</dd>
                        <dt class="font-medium text-zinc-600">⌘/Ctrl+K</dt>
                        <dd>Search groups</dd>
                        <dt class="font-medium text-zinc-600">⌘/Ctrl+F</dt>
                        <dd>Open fullscreen</dd>
                    </dl>
                </div>
                <div class="text-[11px]">
                    <div class="font-bold text-zinc-600">Legend</div>
                    <dl class="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-zinc-500">
                        <dt class="flex h-4 items-center">
                            <span class="h-3 w-4 rounded-sm border-2 border-zinc-900"></span>
                        </dt>
                        <dd>Selected group</dd>
                        <dt class="flex h-4 items-center">
                            <span class="h-0 w-5 border-t-2 border-sky-500"></span>
                        </dt>
                        <dd>This group can access</dd>
                        <dt class="flex h-4 items-center">
                            <span class="h-0 w-5 border-t-2 border-violet-600"></span>
                        </dt>
                        <dd>Can access this group</dd>
                        <dt class="flex h-4 items-center">
                            <span class="h-0 w-5 border-t-2 border-dashed border-zinc-500"></span>
                        </dt>
                        <dd>Inherited access</dd>
                        <dt class="flex h-4 items-center opacity-50">
                            <span
                                class="h-3 w-4 rounded-sm border border-zinc-300 bg-zinc-50"
                            ></span>
                        </dt>
                        <dd class="opacity-50">Not in path</dd>
                    </dl>
                </div>
            </div>
            <div
                v-if="showPermissionOptimisationTip"
                class="mt-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-zinc-600"
            >
                <div class="text-xs font-semibold text-zinc-800">Large permission path</div>
                <div class="mt-0.5 text-[11px] leading-4">
                    This group is being used as a broad shortcut through many inherited access
                    paths. Consider granting access through smaller role or content groups instead.
                    It keeps permissions easier to review and reduces the reach of any one group.
                </div>
            </div>
        </div>
    </LDropdown>
</template>

<style scoped>
.legend-drawer {
    animation: legend-slide-out 120ms ease-out;
}

@keyframes legend-slide-out {
    from {
        opacity: 0;
        transform: translateX(-8px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}
</style>
