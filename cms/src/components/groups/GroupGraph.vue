<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Background } from "@vue-flow/background";

import { Handle, MarkerType, Panel, Position, VueFlow, useVueFlow } from "@vue-flow/core";
import type { NodeDragEvent, NodeMouseEvent } from "@vue-flow/core";
import LButton from "@/components/button/LButton.vue";
import LDropdown from "@/components/common/LDropdown.vue";
import LInput from "@/components/forms/LInput.vue";
import LModal from "@/components/modals/LModal.vue";
import {
    ArrowsPointingInIcon,
    ArrowsPointingOutIcon,
    Cog6ToothIcon,
    CursorArrowRaysIcon,
    ExclamationTriangleIcon,
    HandRaisedIcon,
    InformationCircleIcon,
    MinusIcon,
    PlusSmallIcon,
} from "@heroicons/vue/24/outline";
import type { GroupDto } from "luminary-shared";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

const props = defineProps<{
    groups: GroupDto[];
    allGroups: GroupDto[];
}>();

const emit = defineEmits<{
    (e: "select", groupId: string): void;
}>();

type FlowEdge = {
    id: string;
    source: string;
    target: string;
};

type ChartNode = {
    id: string;
    type: "chartGroup";
    position: { x: number; y: number };
    sourcePosition: Position;
    targetPosition: Position;
    draggable?: boolean;
    selectable?: boolean;
    data: {
        name: string;
        selected?: boolean;
        accessState?: "upstream" | "downstream";
        inherited?: boolean;
        dimmed?: boolean;
        groupId: string;
    };
};

type NodePosition = { x: number; y: number };
type StoredGraphLayout = {
    positions: Record<string, NodePosition>;
    layoutDirection: "LR" | "TB";
    treeColumnCount: number;
    groupIds: string[];
};

const CHART_COLUMN_WIDTH = 320;
const CHART_ROW_HEIGHT = 104;
const CHART_TOP_OFFSET = 120;
const CHART_CARD_WIDTH = 240;
const TREE_COLUMN_WIDTH = 280;
const TREE_ROW_HEIGHT = 120;
const TREE_MIN_COLUMNS = 1;
const TREE_MAX_COLUMNS = 8;
const GRID_SIZE = 22;
const KEYBOARD_PAN_STEP = 80;
const STORAGE_KEY = "group_graph_custom_layout";
const MAX_ANIMATED_EDGES = 38;
const LARGE_PERMISSION_PATH_THRESHOLD = 24;
// const CHART_EDGE_RADIUS = 28;

const chartLanes = [
    { key: "admin", title: "Admin" },
    { key: "users", title: "Users" },
    { key: "editors", title: "Editors" },
    { key: "content", title: "Content" },
    { key: "other", title: "Other" },
] as const;

const { fitView, getViewport, setViewport, zoomIn, zoomOut } = useVueFlow();
const graphRoot = ref<HTMLElement | null>(null);
const legendRoot = ref<HTMLElement | null>(null);
const searchInput = ref<InstanceType<typeof LInput> | null>(null);
const selectedGroupId = ref<string | null>(null);
const layoutDirection = ref<"LR" | "TB">("TB");
const interactionMode = ref<"select" | "drag">("drag");
const treeColumnCount = ref(4);
const showColumnDropdown = ref(false);
const showLegend = ref(false);
const segClass = (active: boolean) =>
    `rounded-none shadow-none ring-0 ${active ? "bg-zinc-100 text-zinc-950" : "bg-white text-zinc-600"}`;
const isFullscreen = ref(false);
const contextMenu = ref<{ groupId: string; groupName: string; x: number; y: number } | null>(null);
const showSearch = ref(false);
const showSearchDropdown = ref(false);
const searchQuery = ref("");
const activeSearchIndex = ref(0);
const manualNodePositions = ref<Record<string, NodePosition>>({});
const savedLayout = ref<StoredGraphLayout | null>(null);
const interactionModeBeforeTemporaryDrag = ref<"select" | "drag" | null>(null);

const groupById = computed(() => new Map(props.allGroups.map((group) => [group._id, group])));
const isTopToBottom = computed(() => layoutDirection.value === "TB");
const targetHandlePosition = computed(() => (isTopToBottom.value ? Position.Top : Position.Left));
const sourceHandlePosition = computed(() =>
    isTopToBottom.value ? Position.Bottom : Position.Right,
);
const searchResults = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    return [...props.allGroups]
        .filter((group) => !query || group.name.toLowerCase().includes(query))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 8);
});

const edges = computed(() => {
    const knownIds = new Set(props.allGroups.map((group) => group._id));
    const edgeMap = new Map<string, FlowEdge>();

    for (const group of props.allGroups) {
        for (const acl of group.acl.filter((entry) => entry.permission.length > 0)) {
            if (!knownIds.has(acl.groupId) || acl.groupId === group._id) continue;

            const key = `${acl.groupId}__${group._id}`;
            if (!edgeMap.has(key))
                edgeMap.set(key, { id: `e-${key}`, source: acl.groupId, target: group._id });
        }
    }

    return [...edgeMap.values()];
});

const downstreamReach = computed(() => {
    const reach = new Map<string, number>();

    props.allGroups.forEach((group) => {
        const visited = new Set<string>();
        const queue = edges.value
            .filter((edge) => edge.source === group._id)
            .map((edge) => edge.target);

        while (queue.length) {
            const current = queue.shift()!;
            if (visited.has(current) || current === group._id) continue;

            visited.add(current);
            edges.value
                .filter((edge) => edge.source === current)
                .forEach((edge) => queue.push(edge.target));
        }

        reach.set(group._id, visited.size);
    });

    return reach;
});

const selectedAccess = computed(() => {
    const selectedId = selectedGroupId.value;
    const directNodes = new Set<string>();
    const inheritedNodes = new Set<string>();
    const upstreamNodes = new Set<string>();
    const downstreamNodes = new Set<string>();
    const directEdges = new Set<string>();
    const inheritedEdges = new Set<string>();
    const upstreamEdges = new Set<string>();
    const downstreamEdges = new Set<string>();

    if (!selectedId)
        return {
            directNodes,
            inheritedNodes,
            upstreamNodes,
            downstreamNodes,
            directEdges,
            inheritedEdges,
            upstreamEdges,
            downstreamEdges,
        };

    const walk = (
        start: string,
        nextEdges: (id: string) => FlowEdge[],
        getNext: (edge: FlowEdge) => string,
        nodeSet: Set<string>,
        edgeSet: Set<string>,
    ) => {
        const seen = new Set<string>([start]);
        const queue = nextEdges(start).map((edge) => ({ edge, depth: 1 }));

        while (queue.length) {
            const { edge, depth } = queue.shift()!;
            const next = getNext(edge);

            edgeSet.add(edge.id);
            nodeSet.add(next);
            if (depth === 1) directEdges.add(edge.id);
            else inheritedEdges.add(edge.id);
            if (depth === 1) directNodes.add(next);
            else inheritedNodes.add(next);

            if (seen.has(next)) continue;
            seen.add(next);
            nextEdges(next).forEach((nextEdge) => queue.push({ edge: nextEdge, depth: depth + 1 }));
        }
    };

    walk(
        selectedId,
        (id) => edges.value.filter((edge) => edge.source === id),
        (edge) => edge.target,
        downstreamNodes,
        downstreamEdges,
    );
    walk(
        selectedId,
        (id) => edges.value.filter((edge) => edge.target === id),
        (edge) => edge.source,
        upstreamNodes,
        upstreamEdges,
    );

    directNodes.delete(selectedId);
    inheritedNodes.delete(selectedId);
    upstreamNodes.delete(selectedId);
    downstreamNodes.delete(selectedId);
    directNodes.forEach((id) => inheritedNodes.delete(id));

    return {
        directNodes,
        inheritedNodes,
        upstreamNodes,
        downstreamNodes,
        directEdges,
        inheritedEdges,
        upstreamEdges,
        downstreamEdges,
    };
});

const chartNodes = computed<ChartNode[]>(() => {
    const laneIndexes = new Map(chartLanes.map((lane, index) => [lane.key, index]));
    const groupsByLane = new Map<string, GroupDto[]>();

    const toChartNode = (group: GroupDto, position: { x: number; y: number }): ChartNode => {
        const dimmed =
            !!selectedGroupId.value &&
            group._id !== selectedGroupId.value &&
            !selectedAccess.value.upstreamNodes.has(group._id) &&
            !selectedAccess.value.downstreamNodes.has(group._id);

        return {
            id: group._id,
            type: "chartGroup",
            position: manualNodePositions.value[group._id] ?? position,
            sourcePosition: sourceHandlePosition.value,
            targetPosition: targetHandlePosition.value,
            draggable: true,
            selectable: true,
            data: {
                name: group.name || "(unnamed group)",
                groupId: group._id,
                selected: group._id === selectedGroupId.value,
                accessState: selectedAccess.value.downstreamNodes.has(group._id)
                    ? "downstream"
                    : selectedAccess.value.upstreamNodes.has(group._id)
                      ? "upstream"
                      : undefined,
                inherited: selectedAccess.value.inheritedNodes.has(group._id),
                dimmed,
            },
        };
    };

    if (isTopToBottom.value) {
        const sortByReach = (a: GroupDto, b: GroupDto) => {
            const reachDelta =
                (downstreamReach.value.get(b._id) ?? 0) - (downstreamReach.value.get(a._id) ?? 0);
            if (reachDelta !== 0) return reachDelta;
            return a.name.localeCompare(b.name);
        };
        const byId = new Map(props.allGroups.map((group) => [group._id, group]));
        const neighbours = new Map(props.allGroups.map((group) => [group._id, new Set<string>()]));

        edges.value.forEach((edge) => {
            neighbours.get(edge.source)?.add(edge.target);
            neighbours.get(edge.target)?.add(edge.source);
        });

        const remaining = new Set(props.allGroups.map((group) => group._id));
        const clusters: GroupDto[][] = [];

        [...props.allGroups].sort(sortByReach).forEach((group) => {
            if (!remaining.has(group._id)) return;

            const cluster: GroupDto[] = [];
            const queue = [group._id];
            remaining.delete(group._id);

            while (queue.length) {
                const id = queue.shift()!;
                const current = byId.get(id);
                if (current) cluster.push(current);

                neighbours.get(id)?.forEach((nextId) => {
                    if (!remaining.has(nextId)) return;
                    remaining.delete(nextId);
                    queue.push(nextId);
                });
            }

            clusters.push(cluster);
        });

        let columnOffset = 0;

        return clusters.flatMap((cluster) => {
            const root = [...cluster].sort(sortByReach)[0];
            const clusterIds = new Set(cluster.map((group) => group._id));
            const depthById = new Map<string, number>();
            const queue = root ? [{ id: root._id, depth: 0 }] : [];

            while (queue.length) {
                const { id, depth } = queue.shift()!;
                const currentDepth = depthById.get(id);
                if (currentDepth !== undefined && currentDepth <= depth) continue;

                depthById.set(id, depth);
                edges.value
                    .filter((edge) => edge.source === id && clusterIds.has(edge.target))
                    .forEach((edge) => queue.push({ id: edge.target, depth: depth + 1 }));
            }

            const fallbackDepth = Math.max(0, ...depthById.values()) + 1;
            const levels = new Map<number, GroupDto[]>();

            [...cluster].sort(sortByReach).forEach((group) => {
                const depth = depthById.get(group._id) ?? fallbackDepth;
                const level = levels.get(depth) ?? [];
                level.push(group);
                levels.set(depth, level);
            });

            const orderedLevels = [...levels.entries()].sort(([a], [b]) => a - b);
            const clusterColumns = Math.min(
                treeColumnCount.value,
                Math.max(1, ...orderedLevels.map(([, groups]) => groups.length)),
            );
            let rowOffset = 0;

            const nodes = orderedLevels.flatMap(([, groups]) => {
                const columns = Math.min(treeColumnCount.value, groups.length);
                const rows = Math.ceil(groups.length / columns);

                const levelNodes = groups.map((group, index) => {
                    const row = Math.floor(index / columns);
                    const column = index % columns;

                    return toChartNode(group, {
                        x:
                            columnOffset * TREE_COLUMN_WIDTH +
                            (clusterColumns - columns) * (TREE_COLUMN_WIDTH / 2) +
                            column * TREE_COLUMN_WIDTH +
                            36,
                        y: (rowOffset + row) * TREE_ROW_HEIGHT + CHART_TOP_OFFSET,
                    });
                });

                rowOffset += rows;
                return levelNodes;
            });

            columnOffset += clusterColumns + 1;
            return nodes;
        });
    }

    chartLanes.forEach((lane) => groupsByLane.set(lane.key, []));
    [...props.allGroups]
        .sort((a, b) => {
            const reachDelta =
                (downstreamReach.value.get(b._id) ?? 0) - (downstreamReach.value.get(a._id) ?? 0);
            if (reachDelta !== 0) return reachDelta;
            return a.name.localeCompare(b.name);
        })
        .forEach((group) => groupsByLane.get(chartLaneKey(group))?.push(group));

    return chartLanes.flatMap((lane) => {
        const laneGroups = groupsByLane.get(lane.key) ?? [];
        const laneIndex = laneIndexes.get(lane.key) ?? 0;
        return laneGroups.map((group, index) =>
            toChartNode(group, {
                x: laneIndex * CHART_COLUMN_WIDTH + 36,
                y: index * CHART_ROW_HEIGHT + CHART_TOP_OFFSET,
            }),
        );
    });
});

const chartEdges = computed(() => {
    const chartNodeIds = new Set(
        chartNodes.value.filter((node) => node.type === "chartGroup").map((node) => node.id),
    );
    const animateDirectEdges =
        selectedAccess.value.directEdges.size > 0 &&
        selectedAccess.value.directEdges.size <= MAX_ANIMATED_EDGES;

    return edges.value
        .filter((edge) => chartNodeIds.has(edge.source) && chartNodeIds.has(edge.target))
        .map((edge) => {
            const direct = selectedAccess.value.directEdges.has(edge.id);
            const inherited = selectedAccess.value.inheritedEdges.has(edge.id);
            const downstream = selectedAccess.value.downstreamEdges.has(edge.id);
            const upstream = selectedAccess.value.upstreamEdges.has(edge.id);
            const active = direct || inherited;
            const stroke = downstream ? "#0284c7" : upstream ? "#7c3aed" : "#cbd5e1";

            return {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                // type: "smoothstep",
                // pathOptions: { borderRadius: CHART_EDGE_RADIUS },
                type: "bezier",
                animated: animateDirectEdges && direct,
                selectable: false,
                focusable: false,
                interactionWidth: 0,
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 16,
                    height: 16,
                    color: active ? stroke : "#94a3b8",
                },
                style: {
                    stroke,
                    strokeDasharray: inherited ? "6 5" : undefined,
                    strokeWidth: active ? 2.8 : 1.2,
                    opacity: active ? 1 : 0.2,
                },
            };
        });
});

function chartLaneKey(group: GroupDto) {
    const name = group.name.toLowerCase();
    if (name.includes("super admin") || name.includes("admin")) return "admin";
    if (name.includes("content")) return "content";
    if (name.includes("editor")) return "editors";
    if (name.includes("user")) return "users";
    return "other";
}

function keepValidSelection() {
    if (selectedGroupId.value && !groupById.value.has(selectedGroupId.value))
        selectedGroupId.value = null;
}

function validPosition(position: unknown): position is NodePosition {
    return (
        !!position &&
        typeof position === "object" &&
        Number.isFinite((position as NodePosition).x) &&
        Number.isFinite((position as NodePosition).y)
    );
}

function cleanPositions(positions: Record<string, NodePosition>) {
    const groupIds = new Set(props.allGroups.map((group) => group._id));
    return Object.fromEntries(
        Object.entries(positions).filter(
            ([groupId, position]) => groupIds.has(groupId) && validPosition(position),
        ),
    );
}

function currentStoredLayout(): StoredGraphLayout {
    const groupIds = props.allGroups.map((group) => group._id).sort();
    return {
        positions: cleanPositions(manualNodePositions.value),
        layoutDirection: layoutDirection.value,
        treeColumnCount: treeColumnCount.value,
        groupIds,
    };
}

function layoutKey(layout: StoredGraphLayout | null) {
    if (!layout) return "";
    const positions = Object.fromEntries(
        Object.entries(layout.positions).sort(([a], [b]) => a.localeCompare(b)),
    );
    return JSON.stringify({ ...layout, positions, groupIds: [...layout.groupIds].sort() });
}

function readStoredLayout() {
    if (typeof localStorage === "undefined") return null;

    try {
        const parsed = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "null",
        ) as Partial<StoredGraphLayout> | null;
        if (!parsed || typeof parsed !== "object" || !parsed.positions) return null;

        const positions = Object.fromEntries(
            Object.entries(parsed.positions).filter(([, position]) => validPosition(position)),
        );

        return {
            positions,
            layoutDirection: parsed.layoutDirection === "LR" ? "LR" : "TB",
            treeColumnCount: Math.min(
                TREE_MAX_COLUMNS,
                Math.max(TREE_MIN_COLUMNS, Number(parsed.treeColumnCount) || 4),
            ),
            groupIds: Array.isArray(parsed.groupIds)
                ? parsed.groupIds.filter((id) => typeof id === "string")
                : [],
        } satisfies StoredGraphLayout;
    } catch {
        return null;
    }
}

function applyStoredLayout(layout = savedLayout.value) {
    if (!layout) return;

    layoutDirection.value = layout.layoutDirection;
    treeColumnCount.value = layout.treeColumnCount;
    manualNodePositions.value = { ...layout.positions };
    showColumnDropdown.value = false;
}

function saveCustomLayout() {
    if (typeof localStorage === "undefined") return;

    const layout = currentStoredLayout();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    savedLayout.value = layout;
}

function resetLayout() {
    manualNodePositions.value = {};
    showColumnDropdown.value = false;
}

function clearSavedLayout() {
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
    savedLayout.value = null;
    showColumnDropdown.value = false;
}

function updateTreeColumnCount(event: Event) {
    treeColumnCount.value = Number((event.target as HTMLInputElement).value);
}

const hasManualNodePositions = computed(
    () => Object.keys(cleanPositions(manualNodePositions.value)).length > 0,
);
const hasUnsavedLayout = computed(
    () =>
        hasManualNodePositions.value &&
        layoutKey(currentStoredLayout()) !== layoutKey(savedLayout.value),
);
const selectedPermissionFootprint = computed(() => {
    if (!selectedGroupId.value) return 0;

    return (
        selectedAccess.value.directEdges.size +
        selectedAccess.value.inheritedEdges.size +
        selectedAccess.value.upstreamEdges.size +
        selectedAccess.value.downstreamEdges.size
    );
});
const showPermissionOptimisationTip = computed(
    () => selectedPermissionFootprint.value > LARGE_PERMISSION_PATH_THRESHOLD,
);

function openContextGroup() {
    if (!contextMenu.value) return;
    emit("select", contextMenu.value.groupId);
    contextMenu.value = null;
}

function clearFocus() {
    contextMenu.value = null;
    selectedGroupId.value = null;
}

function closeContextMenu() {
    contextMenu.value = null;
}

function closeLegendOnOutsideClick(event: MouseEvent) {
    if (showLegend.value && !legendRoot.value?.contains(event.target as Node))
        showLegend.value = false;
}

function isInteractiveNode(node: { type?: string; data?: { dimmed?: boolean } }) {
    return node.type === "chartGroup";
}

function selectNode(node: { id: string; type?: string; data?: { dimmed?: boolean } }) {
    if (!isInteractiveNode(node)) return;
    selectedGroupId.value = node.id;
}

function selectGroup(groupId: string) {
    selectedGroupId.value = groupId;
}

function openSearch() {
    if (!isFullscreen.value) return;
    showSearch.value = true;
    showSearchDropdown.value = true;
    searchQuery.value = "";
    activeSearchIndex.value = 0;
    graphRoot.value?.focus();
    nextTick(() => requestAnimationFrame(() => searchInput.value?.focus()));
}

function closeSearch() {
    showSearch.value = false;
    showSearchDropdown.value = false;
}

function selectSearchResult(groupId: string) {
    selectedGroupId.value = groupId;
    closeSearch();
    graphRoot.value?.focus();
}

function openSearchDropdown() {
    showSearchDropdown.value = true;
    nextTick(() => requestAnimationFrame(() => searchInput.value?.focus()));
}

function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        return;
    }

    if (event.key === "ArrowDown") {
        event.preventDefault();
        showSearchDropdown.value = true;
        activeSearchIndex.value =
            (activeSearchIndex.value + 1) % Math.max(searchResults.value.length, 1);
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        showSearchDropdown.value = true;
        activeSearchIndex.value =
            (activeSearchIndex.value - 1 + Math.max(searchResults.value.length, 1)) %
            Math.max(searchResults.value.length, 1);
        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        const group = searchResults.value[activeSearchIndex.value];
        if (group) selectSearchResult(group._id);
    }
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
        groupName: group.name || "(unnamed group)",
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
    emit("select", node.id);
}

function saveNodePosition({ node, nodes }: NodeDragEvent) {
    const movedNodes = nodes.length ? nodes : [node];
    manualNodePositions.value = {
        ...manualNodePositions.value,
        ...Object.fromEntries(
            movedNodes.map((movedNode) => [
                movedNode.id,
                { x: movedNode.position.x, y: movedNode.position.y },
            ]),
        ),
    };
}

function handleGlobalKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!isFullscreen.value) return;
        event.preventDefault();
        openSearch();
        return;
    }

    if (event.key === "Escape" && showSearch.value) {
        event.preventDefault();
        closeSearch();
    }
}

function isSpaceKey(event: KeyboardEvent) {
    return event.code === "Space" || event.key === " ";
}

function startTemporaryDragMode() {
    interactionModeBeforeTemporaryDrag.value ??= interactionMode.value;
    interactionMode.value = "drag";
}

function stopTemporaryDragMode() {
    if (!interactionModeBeforeTemporaryDrag.value) return;

    interactionMode.value = interactionModeBeforeTemporaryDrag.value;
    interactionModeBeforeTemporaryDrag.value = null;
}

function startSpaceDragMode(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || !isSpaceKey(event) || event.repeat) return;

    event.preventDefault();
    startTemporaryDragMode();
}

function stopSpaceDragMode(event: KeyboardEvent) {
    if (isSpaceKey(event)) stopTemporaryDragMode();
}

function startMiddleMouseDragMode(event: PointerEvent) {
    if (event.button !== 1) return;

    startTemporaryDragMode();
}

function stopMiddleMouseDragMode(event: PointerEvent) {
    if (event.button === 1) stopTemporaryDragMode();
}

function handleGraphKeydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement) return;
    startSpaceDragMode(event);

    if (event.key === "Escape") {
        event.preventDefault();
        if (isFullscreen.value) {
            isFullscreen.value = false;
            return;
        }
        contextMenu.value = null;
        selectedGroupId.value = null;
        return;
    }

    if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        event.stopPropagation();
        zoomIn({ duration: 80 });
        return;
    }

    if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        event.stopPropagation();
        zoomOut({ duration: 80 });
        return;
    }

    if (event.key === "0") {
        event.preventDefault();
        event.stopPropagation();
        fitView({ padding: 0.18, duration: 120 });
        return;
    }

    const pan = {
        ArrowUp: { x: 0, y: KEYBOARD_PAN_STEP },
        ArrowDown: { x: 0, y: -KEYBOARD_PAN_STEP },
        ArrowLeft: { x: KEYBOARD_PAN_STEP, y: 0 },
        ArrowRight: { x: -KEYBOARD_PAN_STEP, y: 0 },
    }[event.key];

    if (!pan) return;

    event.preventDefault();
    event.stopPropagation();
    const viewport = getViewport();
    setViewport({ ...viewport, x: viewport.x + pan.x, y: viewport.y + pan.y }, { duration: 80 });
}

watch(
    () => props.allGroups,
    () => keepValidSelection(),
    { immediate: true, deep: true },
);

watch(
    () => [
        props.allGroups.length,
        edges.value.length,
        layoutDirection.value,
        treeColumnCount.value,
    ],
    () => nextTick(() => fitView({ padding: 0.18, duration: 250 })),
);

watch(searchQuery, () => {
    activeSearchIndex.value = 0;
    showSearchDropdown.value = true;
});

watch(isFullscreen, (fullscreen) => {
    if (fullscreen) showLegend.value = false;
    if (!fullscreen) closeSearch();
    nextTick(() => {
        graphRoot.value?.focus();
        fitView({ padding: 0.18, duration: 120 });
    });
});

onMounted(() => {
    savedLayout.value = readStoredLayout();
    applyStoredLayout();
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("keyup", stopSpaceDragMode);
    window.addEventListener("pointerup", stopMiddleMouseDragMode);
});
onUnmounted(() => {
    window.removeEventListener("keydown", handleGlobalKeydown);
    window.removeEventListener("keyup", stopSpaceDragMode);
    window.removeEventListener("pointerup", stopMiddleMouseDragMode);
});
</script>

<template>
    <component
        :is="isFullscreen ? LModal : 'div'"
        v-model:isVisible="isFullscreen"
        heading="Visualisation"
        no-divider
        large-modal
        stick-to-edges
        :class="isFullscreen ? '' : 'h-full min-h-0 w-full'"
    >
        <div
            ref="graphRoot"
            class="relative min-h-0 select-none overflow-hidden outline-none focus:outline-none focus-visible:outline-none"
            :class="isFullscreen ? 'h-[calc(100dvh-6rem)] w-[calc(100vw-3rem)]' : 'h-full w-full'"
            tabindex="0"
            aria-label="Group visualisation. Hold Space or middle mouse to drag, use arrow keys to pan, plus and minus to zoom, Tab to move through groups, Enter or Space to focus a group. In full screen, Command K opens search."
            @auxclick.prevent
            @click.capture="closeLegendOnOutsideClick"
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
                pan-activation-key-code="Space"
                @node-click="({ node }) => selectNode(node)"
                @node-double-click="openNodeGroup"
                @node-context-menu="openNodeContextMenu"
                @node-drag-stop="saveNodePosition"
                @selection-drag-stop="saveNodePosition"
                @pane-click="closeContextMenu"
            >
                <template #node-chartGroup="{ data }">
                    <button
                        type="button"
                        class="relative rounded-xl border bg-white px-3 py-3 text-center shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                        :style="{ width: `${CHART_CARD_WIDTH}px` }"
                        :class="
                            data.selected
                                ? 'border-2 border-zinc-950 bg-zinc-950 text-white'
                                : data.accessState === 'downstream'
                                  ? 'border-sky-300 bg-sky-300 opacity-100'
                                  : data.accessState === 'upstream'
                                    ? 'border-violet-300 bg-violet-300 opacity-100'
                                    : data.dimmed
                                      ? 'border-zinc-200 opacity-25'
                                      : 'border-zinc-200'
                        "
                        tabindex="0"
                        @click.stop="selectGroup(data.groupId)"
                        @keydown.enter.prevent="selectGroup(data.groupId)"
                        @keydown.space.prevent="selectGroup(data.groupId)"
                    >
                        <Handle
                            type="target"
                            :position="targetHandlePosition"
                            :connectable="false"
                            class="chart-handle"
                        />
                        <div
                            class="truncate text-sm font-semibold"
                            :class="data.selected ? 'text-white' : 'text-zinc-900'"
                        >
                            {{ data.name }}
                        </div>
                        <Handle
                            type="source"
                            :position="sourceHandlePosition"
                            :connectable="false"
                            class="chart-handle"
                        />
                    </button>
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
                class="pointer-events-none absolute left-32 right-3 top-3 z-40 flex flex-wrap justify-end gap-2 sm:left-40 sm:right-4 sm:top-4"
            >
                <div
                    class="pointer-events-auto inline-flex divide-x divide-zinc-300 overflow-hidden rounded-md shadow-sm ring-1 ring-zinc-300"
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
                <LButton
                    v-if="hasUnsavedLayout"
                    size="sm"
                    variant="secondary"
                    class="pointer-events-auto"
                    @click="saveCustomLayout"
                >
                    Save custom layout
                </LButton>
                <div v-if="!isFullscreen" ref="legendRoot" class="pointer-events-auto relative">
                    <LButton
                        size="sm"
                        variant="secondary"
                        :icon="
                            showPermissionOptimisationTip
                                ? ExclamationTriangleIcon
                                : InformationCircleIcon
                        "
                        :main-dynamic-css="
                            showPermissionOptimisationTip
                                ? 'bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100'
                                : ''
                        "
                        class="shadow-md"
                        :aria-label="
                            showPermissionOptimisationTip
                                ? 'Large permission path'
                                : 'Visualisation'
                        "
                        @click="showLegend = !showLegend"
                    />
                    <div
                        v-if="showLegend"
                        class="legend-drawer absolute right-0 top-full mt-2 w-max max-w-[calc(100vw-1.5rem)] rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs shadow-lg sm:max-w-md"
                    >
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <div class="text-sm font-semibold text-zinc-900">Visualisation</div>
                                <div class="mt-0.5 text-zinc-500">
                                    Select a group to see who can access it and what it can access.
                                </div>
                            </div>
                            <LButton size="sm" variant="tertiary" @click="showLegend = false"
                                >Hide</LButton
                            >
                        </div>
                        <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-zinc-600">
                            <span class="inline-flex items-center gap-1.5">
                                <span class="h-3 w-4 rounded-sm border-2 border-zinc-900"></span>
                                Selected group
                            </span>
                            <span class="inline-flex items-center gap-1.5">
                                <span class="h-0 w-5 border-t-2 border-sky-500"></span>
                                This group can access
                            </span>
                            <span class="inline-flex items-center gap-1.5">
                                <span class="h-0 w-5 border-t-2 border-violet-600"></span>
                                Can access this group
                            </span>
                            <span class="inline-flex items-center gap-1.5">
                                <span
                                    class="h-0 w-5 border-t-2 border-dashed border-zinc-500"
                                ></span>
                                Dashed = inherited
                            </span>
                            <span class="inline-flex items-center gap-1.5 opacity-50">
                                <span
                                    class="h-3 w-4 rounded-sm border border-zinc-300 bg-zinc-50"
                                ></span>
                                Not in path
                            </span>
                        </div>
                        <div
                            v-if="showPermissionOptimisationTip"
                            class="mt-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-zinc-600"
                        >
                            <div class="text-xs font-semibold text-zinc-800">
                                Large permission path
                            </div>
                            <div class="mt-0.5 text-[11px] leading-4">
                                This group is being used as a broad shortcut through many inherited
                                access paths. Consider granting access through smaller role or
                                content groups instead. It keeps permissions easier to review and
                                reduces the reach of any one group.
                            </div>
                        </div>
                    <div class="mt-2 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
                        <span class="font-medium text-zinc-600">Keys:</span>
                        <span class="ml-1 inline-flex flex-wrap gap-x-2 gap-y-1">
                            <span>Space hold drag</span>
                            <span>Middle mouse drag</span>
                            <span>Arrows pan</span>
                            <span>+/- zoom</span>
                            <span>0 fit</span>
                            <span>Tab groups</span>
                            <span>Enter/Space select</span>
                            <span>Esc close/clear</span>
                            <span>Fullscreen Cmd/Ctrl+K search</span>
                        </span>
                    </div>
                </div>
            </div>
                <LDropdown
                    v-model:show="showColumnDropdown"
                    placement="bottom-end"
                    width="auto"
                    padding="small"
                    class="pointer-events-auto"
                >
                    <template #trigger>
                        <LButton size="sm" variant="secondary" :icon="Cog6ToothIcon" />
                    </template>
                    <LButton
                        variant="tertiary"
                        size="sm"
                        role="menuitem"
                        class="w-full justify-start"
                        @click="
                            layoutDirection = isTopToBottom ? 'LR' : 'TB';
                            showColumnDropdown = false;
                        "
                    >
                        {{ isTopToBottom ? "Left to right" : "Top to bottom" }}
                    </LButton>
                    <div class="my-1 border-t border-zinc-100"></div>
                    <div class="px-3 py-2">
                        <label
                            for="group-graph-columns"
                            class="mb-2 flex items-center justify-between gap-4 text-xs font-semibold uppercase tracking-wide text-zinc-500"
                        >
                            <span>Tree columns</span>
                            <span class="text-zinc-700">{{ treeColumnCount }}</span>
                        </label>
                        <input
                            id="group-graph-columns"
                            type="range"
                            :min="TREE_MIN_COLUMNS"
                            :max="TREE_MAX_COLUMNS"
                            step="1"
                            :value="treeColumnCount"
                            class="h-2 w-40 cursor-pointer appearance-none rounded-lg bg-gray-200 accent-gray-700"
                            @input="updateTreeColumnCount"
                        />
                    </div>
                    <div class="my-1 border-t border-zinc-100"></div>
                    <LButton
                        v-if="savedLayout"
                        variant="tertiary"
                        size="sm"
                        role="menuitem"
                        class="w-full justify-start"
                        @click="applyStoredLayout()"
                    >
                        Use saved layout
                    </LButton>
                    <LButton
                        variant="tertiary"
                        size="sm"
                        role="menuitem"
                        class="w-full justify-start"
                        @click="resetLayout"
                    >
                        Reset layout
                    </LButton>
                    <LButton
                        v-if="savedLayout"
                        variant="tertiary"
                        size="sm"
                        role="menuitem"
                        class="w-full justify-start"
                        @click="clearSavedLayout"
                    >
                        Clear saved layout
                    </LButton>
                </LDropdown>
                <LButton
                    v-if="!isFullscreen"
                    size="sm"
                    variant="secondary"
                    :icon="isFullscreen ? ArrowsPointingInIcon : ArrowsPointingOutIcon"
                    class="pointer-events-auto"
                    @click="isFullscreen = !isFullscreen"
                />
            </div>

            <div
                v-if="showSearch && isFullscreen"
                class="absolute inset-0 z-[60] flex items-start justify-center bg-white/40 px-4 pt-20 backdrop-blur-[1px]"
                @click.self="closeSearch"
            >
                <div
                    class="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-3 shadow-xl"
                >
                    <LDropdown
                        v-model:show="showSearchDropdown"
                        placement="bottom-start"
                        width="full"
                        padding="none"
                        class="w-full"
                    >
                        <template #trigger>
                            <LInput
                                ref="searchInput"
                                v-model="searchQuery"
                                name="group-search"
                                placeholder="Search groups"
                                autocomplete="off"
                                @click.prevent.stop="openSearchDropdown"
                                @focus="openSearchDropdown"
                                @keydown.stop="handleSearchKeydown"
                            />
                        </template>
                        <LButton
                            v-for="(group, index) in searchResults"
                            :key="group._id"
                            variant="tertiary"
                            size="sm"
                            role="menuitem"
                            class="w-full justify-start"
                            :main-dynamic-css="index === activeSearchIndex ? 'bg-sky-50' : ''"
                            @click="selectSearchResult(group._id)"
                        >
                            {{ group.name || "(unnamed group)" }}
                        </LButton>
                        <div
                            v-if="searchResults.length === 0"
                            class="px-3 py-6 text-center text-sm text-zinc-500"
                        >
                            No groups found
                        </div>
                    </LDropdown>
                </div>
            </div>

            <div
                v-if="contextMenu"
                class="absolute z-20 min-w-44 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg"
                :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
                @click.stop
                @contextmenu.prevent
            >
                <div class="border-b border-zinc-100 px-3 py-2 text-xs font-medium text-zinc-500">
                    {{ contextMenu.groupName }}
                </div>
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
    border: 1px solid #d4d4d8;
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
