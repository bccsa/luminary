<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Background } from "@vue-flow/background";

import { Panel, Position, VueFlow, useVueFlow } from "@vue-flow/core";
import type { NodeMouseEvent } from "@vue-flow/core";
import LButton from "@/components/button/LButton.vue";
import LModal from "@/components/modals/LModal.vue";
import {
    ArrowsPointingInIcon,
    ArrowsPointingOutIcon,
    CursorArrowRaysIcon,
    HandRaisedIcon,
    MinusIcon,
    PlusSmallIcon,
    XMarkIcon,
} from "@heroicons/vue/24/outline";
import type { GroupDto } from "luminary-shared";
import {
    GRID_SIZE,
    TREE_MAX_COLUMNS,
    TREE_MIN_COLUMNS,
} from "./types";
import { useGroupAccessGraph } from "./useGroupAccessGraph";
import { useGroupGraphLayout } from "./useGroupGraphLayout";
import { useGroupGraphLayoutStorage } from "./useGroupGraphLayoutStorage";
import { useGroupGraphInteraction } from "./useGroupGraphInteraction";
import GraphNode from "./GraphNode.vue";
import GraphLegend from "./GraphLegend.vue";
import GraphSettingsMenu from "./GraphSettingsMenu.vue";
import GraphSearch from "./GraphSearch.vue";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

const props = defineProps<{
    // ponytail: dead prop, never read; the graph always renders allGroups. Remove with parent in a follow-up.
    groups: GroupDto[];
    allGroups: GroupDto[];
}>();

const emit = defineEmits<{
    (e: "select", groupId: string): void;
    (e: "open", groupId: string): void;
}>();

const { fitView, getViewport, setViewport, zoomIn, zoomOut } = useVueFlow();
const graphRoot = ref<HTMLElement | null>(null);
const selectedGroupId = ref<string | null>(null);
const initialFitDone = ref(false);
const segClass = (active: boolean) =>
    `rounded-none shadow-none ring-0 ${active ? "bg-zinc-100 text-zinc-950" : "bg-white text-zinc-600"}`;
const isFullscreen = ref(false);
const contextMenu = ref<{ groupId: string; x: number; y: number } | null>(null);
const showSearch = ref(false);
const {
    layoutDirection,
    treeColumnCount,
    manualNodePositions,
    savedLayout,
    applyStoredLayout,
    saveCustomLayout,
    resetLayout,
    clearSavedLayout,
    saveNodePosition,
    updateTreeColumnCount,
    hasUnsavedLayout,
} = useGroupGraphLayoutStorage(() => props.allGroups);

const groupById = computed(() => new Map(props.allGroups.map((group) => [group._id, group])));
const isTopToBottom = computed(() => layoutDirection.value === "TB");
const targetHandlePosition = computed(() => (isTopToBottom.value ? Position.Top : Position.Left));
const sourceHandlePosition = computed(() =>
    isTopToBottom.value ? Position.Bottom : Position.Right,
);

const accessGraph = useGroupAccessGraph(() => props.allGroups, selectedGroupId);

const { chartNodes, chartEdges } = useGroupGraphLayout(() => props.allGroups, accessGraph, {
    selectedGroupId,
    layoutDirection,
    treeColumnCount,
    manualNodePositions,
    sourceHandlePosition,
    targetHandlePosition,
});

// Switching layout direction re-lays-out for that direction. Manual drag positions
// belong to the previous direction's coordinate system, so keep them and the reflowed
// nodes would mix two layouts and overlap — drop them so the new direction lays out clean.
function selectLayoutDirection(direction: "TB" | "LR") {
    if (layoutDirection.value === direction) return;
    layoutDirection.value = direction;
    resetLayout();
}

function keepValidSelection() {
    if (selectedGroupId.value && !groupById.value.has(selectedGroupId.value))
        selectedGroupId.value = null;
}

function openContextGroup() {
    if (!contextMenu.value) return;
    emit("open", contextMenu.value.groupId);
    contextMenu.value = null;
}

function clearFocus() {
    contextMenu.value = null;
    selectedGroupId.value = null;
}

function closeContextMenu() {
    contextMenu.value = null;
}

function isInteractiveNode(node: { type?: string; data?: { dimmed?: boolean } }) {
    return node.type === "chartGroup";
}

function selectNode(node: { id: string; type?: string; data?: { dimmed?: boolean } }) {
    if (!isInteractiveNode(node)) return;
    selectGroup(node.id);
}

function selectGroup(groupId: string) {
    selectedGroupId.value = groupId;
    emit("select", groupId);
}

function onSearchSelect(groupId: string) {
    selectedGroupId.value = groupId;
    graphRoot.value?.focus();
}

function fitInitialView() {
    if (initialFitDone.value || !chartNodes.value.length) return;

    initialFitDone.value = true;
    nextTick(() => requestAnimationFrame(() => fitView({ padding: 0.18, duration: 0 })));
}

function openNodeContextMenu({ event, node }: NodeMouseEvent) {
    if (!isInteractiveNode(node)) return;
    if (!(event instanceof MouseEvent)) return;

    event.preventDefault();
    event.stopPropagation();

    const group = groupById.value.get(node.id);
    if (!group) return;

    selectedGroupId.value = node.id;
    const rect = graphRoot.value?.getBoundingClientRect();
    const x = rect ? event.clientX - rect.left : event.offsetX;
    const y = rect ? event.clientY - rect.top : event.offsetY;

    contextMenu.value = {
        groupId: node.id,
        x: Math.max(8, x),
        y: Math.max(8, y),
    };
}

function openNodeGroup({ event, node }: NodeMouseEvent) {
    if (!isInteractiveNode(node)) return;

    event.preventDefault();
    event.stopPropagation();
    selectedGroupId.value = node.id;
    contextMenu.value = null;
    emit("open", node.id);
}

const {
    interactionMode,
    handleGraphKeydown,
    stopSpaceDragMode,
    startMiddleMouseDragMode,
    stopMiddleMouseDragMode,
} = useGroupGraphInteraction({
    graphRoot,
    isFullscreen,
    flow: { fitView, getViewport, setViewport, zoomIn, zoomOut },
    onClearFocus: clearFocus,
    onOpenSearch: () => (showSearch.value = true),
    onCloseSearch: () => (showSearch.value = false),
    isSearchOpen: () => showSearch.value,
});

watch(
    () => props.allGroups,
    () => keepValidSelection(),
    { immediate: true, deep: true },
);

// Center only after VueFlow has measured custom nodes. Later layout changes do
// not re-center — the user positions the view themselves after the first fit.

watch(isFullscreen, () => {
    nextTick(() => graphRoot.value?.focus());
});
</script>

<template>
    <component
        :is="isFullscreen ? LModal : 'div'"
        v-model:isVisible="isFullscreen"
        heading=""
        no-divider
        no-padding
        transparent-header
        large-modal
        stick-to-edges
        :show-closing-button="false"
        :class="isFullscreen ? '' : 'h-full min-h-0 w-full'"
    >
        <div
            ref="graphRoot"
            class="relative min-h-0 select-none overflow-hidden outline-none focus:outline-none focus-visible:outline-none"
            :class="isFullscreen ? 'h-[100dvh] w-screen' : 'h-full w-full'"
            tabindex="0"
            aria-label="Group visualisation. Hold Space to switch between select and drag, use middle mouse to drag, use arrow keys to pan, plus and minus to zoom, Tab to move through groups, Enter or Space to focus a group. Command K opens search. Command F opens fullscreen."
            @auxclick.prevent
            @keydown.capture="handleGraphKeydown"
            @keyup.capture="stopSpaceDragMode"
            @pointerdown.capture="startMiddleMouseDragMode"
            @pointerup.capture="stopMiddleMouseDragMode"
        >
            <VueFlow
                class="h-full w-full"
                :nodes="chartNodes"
                :edges="chartEdges"
                :min-zoom="0.2"
                :max-zoom="1.8"
                :nodes-connectable="false"
                :nodes-draggable="interactionMode === 'drag'"
                :node-drag-threshold="8"
                :pan-on-drag="interactionMode === 'drag' ? [0, 1] : [1]"
                :selection-key-code="interactionMode === 'select' ? true : null"
                :snap-to-grid="true"
                :snap-grid="[GRID_SIZE, GRID_SIZE]"
                :edges-updatable="false"
                :disable-keyboard-a11y="true"
                :zoom-on-double-click="false"
                :pan-activation-key-code="null"
                @nodes-initialized="fitInitialView"
                @node-click="({ node }) => selectNode(node)"
                @node-double-click="openNodeGroup"
                @node-context-menu="openNodeContextMenu"
                @node-drag="saveNodePosition"
                @node-drag-stop="saveNodePosition"
                @selection-drag="saveNodePosition"
                @selection-drag-stop="saveNodePosition"
                @pane-click="clearFocus"
            >
                <template #node-chartGroup="{ data, sourcePosition, targetPosition }">
                    <GraphNode
                        :key="`${data.groupId}-${sourcePosition ?? sourceHandlePosition}-${targetPosition ?? targetHandlePosition}`"
                        :data="data"
                        :source-position="sourcePosition ?? sourceHandlePosition"
                        :target-position="targetPosition ?? targetHandlePosition"
                        @select="selectGroup"
                    />
                </template>

                <Background pattern-color="#e4e4e7" :gap="GRID_SIZE" />
                <Panel position="bottom-left">
                    <div class="flex flex-col gap-1">
                        <LButton
                            size="sm"
                            variant="secondary"
                            :icon="PlusSmallIcon"
                            @click="zoomIn({ duration: 80 })"
                        />
                        <LButton
                            size="sm"
                            variant="secondary"
                            :icon="MinusIcon"
                            @click="zoomOut({ duration: 80 })"
                        />
                        <LButton
                            size="sm"
                            variant="secondary"
                            :icon="ArrowsPointingInIcon"
                            @click="fitView({ padding: 0.18, duration: 120 })"
                        />
                    </div>
                </Panel>
            </VueFlow>

            <div
                class="pointer-events-none absolute left-3 right-3 top-1 z-40 flex items-start gap-2 py-2 sm:right-4 sm:top-2"
            >
                <div
                    class="pointer-events-auto -my-2 min-w-0 flex-1 overflow-x-auto py-2 scrollbar-hide"
                >
                    <div class="flex w-max flex-nowrap items-start gap-2 sm:ml-auto">
                        <div
                            class="pointer-events-auto flex h-9 shrink-0 divide-x divide-zinc-300 overflow-hidden rounded-md shadow-sm ring-1 ring-zinc-300"
                        >
                            <LButton
                                size="sm"
                                variant="secondary"
                                :icon="CursorArrowRaysIcon"
                                :main-dynamic-css="segClass(interactionMode === 'select')"
                                @click="interactionMode = 'select'"
                            >
                                Select
                            </LButton>
                            <LButton
                                size="sm"
                                variant="secondary"
                                :icon="HandRaisedIcon"
                                :main-dynamic-css="segClass(interactionMode === 'drag')"
                                @click="interactionMode = 'drag'"
                            >
                                Drag
                            </LButton>
                        </div>
                        <div
                            class="pointer-events-auto hidden h-9 shrink-0 divide-x divide-zinc-300 overflow-hidden rounded-md shadow-sm ring-1 ring-zinc-300 sm:flex"
                        >
                            <LButton
                                size="sm"
                                variant="secondary"
                                :main-dynamic-css="segClass(isTopToBottom)"
                                @click="selectLayoutDirection('TB')"
                            >
                                Top down
                            </LButton>
                            <LButton
                                size="sm"
                                variant="secondary"
                                :main-dynamic-css="segClass(!isTopToBottom)"
                                @click="selectLayoutDirection('LR')"
                            >
                                Left right
                            </LButton>
                        </div>
                        <div
                            class="pointer-events-auto hidden h-9 shrink-0 items-center gap-2 rounded-md bg-white px-3 text-xs text-zinc-600 shadow-sm ring-1 ring-zinc-300 sm:flex"
                        >
                            <label for="group-graph-columns-desktop" class="font-medium">
                                Columns
                            </label>
                            <input
                                id="group-graph-columns-desktop"
                                type="range"
                                :min="TREE_MIN_COLUMNS"
                                :max="TREE_MAX_COLUMNS"
                                step="1"
                                :value="treeColumnCount"
                                class="h-2 w-28 cursor-pointer appearance-none rounded-lg bg-gray-200 accent-gray-700"
                                @input="updateTreeColumnCount"
                            />
                            <span class="w-3 text-right font-medium text-zinc-700">
                                {{ treeColumnCount }}
                            </span>
                        </div>
                        <LButton
                            v-if="hasUnsavedLayout"
                            size="sm"
                            variant="secondary"
                            class="pointer-events-auto h-9 shrink-0"
                            @click="saveCustomLayout"
                        >
                            Save custom layout
                        </LButton>
                        <LButton
                            v-if="savedLayout"
                            size="sm"
                            variant="secondary"
                            class="pointer-events-auto hidden h-9 shrink-0 sm:flex"
                            @click="applyStoredLayout()"
                        >
                            Use saved layout
                        </LButton>
                        <LButton
                            size="sm"
                            variant="secondary"
                            class="pointer-events-auto hidden h-9 shrink-0 sm:flex"
                            @click="resetLayout"
                        >
                            Reset layout
                        </LButton>
                        <LButton
                            v-if="savedLayout"
                            size="sm"
                            variant="secondary"
                            class="pointer-events-auto hidden h-9 shrink-0 sm:flex"
                            @click="clearSavedLayout"
                        >
                            Clear saved layout
                        </LButton>
                        <GraphLegend v-if="!isFullscreen" />
                        <GraphSettingsMenu
                            :layout-direction="layoutDirection"
                            @update:layout-direction="selectLayoutDirection"
                            v-model:tree-column-count="treeColumnCount"
                            :saved-layout-exists="!!savedLayout"
                            @apply-saved="applyStoredLayout()"
                            @reset="resetLayout"
                            @clear-saved="clearSavedLayout"
                        />
                        <LButton
                            v-if="!isFullscreen"
                            size="sm"
                            variant="secondary"
                            :icon="isFullscreen ? ArrowsPointingInIcon : ArrowsPointingOutIcon"
                            class="pointer-events-auto h-9 w-9 shrink-0"
                            @click="isFullscreen = !isFullscreen"
                        />
                    </div>
                </div>
                <LButton
                    v-if="isFullscreen"
                    size="sm"
                    variant="secondary"
                    :icon="XMarkIcon"
                    class="pointer-events-auto h-9 w-9 shrink-0"
                    @click="isFullscreen = false"
                />
            </div>

            <GraphSearch
                v-model:show="showSearch"
                :all-groups="allGroups"
                @select="onSearchSelect"
            />

            <div
                v-if="contextMenu"
                class="absolute z-20 min-w-44 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg"
                :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
                @click.stop
                @contextmenu.prevent
            >
                <LButton
                    variant="tertiary"
                    size="sm"
                    class="w-full justify-start"
                    @click="openContextGroup"
                >
                    Open group
                </LButton>
            </div>
        </div>
    </component>
</template>

<style scoped>
:deep(.chart-handle) {
    height: 6px;
    width: 6px;
    min-width: 6px;
    border: 1px solid #bcbcbc;
    background: #ffffff;
    opacity: 0.8;
}

/* Marquee (multi-)selected nodes — VueFlow adds .selected to the node wrapper. */
:deep(.vue-flow__pane:focus),
:deep(.vue-flow:focus),
:deep(.vue-flow__container:focus) {
    outline: none;
}

:deep(.vue-flow__node.selected > button) {
    border-color: #18181b; /* zinc-900 */
    box-shadow: 0 0 0 2px #18181b;
}
</style>
