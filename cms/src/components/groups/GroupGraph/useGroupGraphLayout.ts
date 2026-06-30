import { computed, type Ref } from "vue";
import { MarkerType, Position } from "@vue-flow/core";
import type { GroupDto } from "luminary-shared";
import {
    CHART_COLUMN_WIDTH,
    CHART_ROW_HEIGHT,
    CHART_TOP_OFFSET,
    TREE_COLUMN_WIDTH,
    TREE_ROW_HEIGHT,
    chartLanes,
    snapPosition,
    type ChartNode,
    type NodePosition,
} from "./types";
import { chartLaneKey, useGroupAccessGraph } from "./useGroupAccessGraph";

type LayoutOptions = {
    selectedGroupId: Ref<string | null>;
    layoutDirection: Ref<"LR" | "TB">;
    treeColumnCount: Ref<number>;
    manualNodePositions: Ref<Record<string, NodePosition>>;
    sourceHandlePosition: Ref<Position>;
    targetHandlePosition: Ref<Position>;
};

/**
 * Computes the VueFlow node positions (cluster/level tree layout for TB, lane
 * layout for LR) and styled edges from the access graph and layout settings.
 */
export function useGroupGraphLayout(
    allGroups: () => GroupDto[],
    access: ReturnType<typeof useGroupAccessGraph>,
    opts: LayoutOptions,
) {
    const { edges, downstreamReach, selectedAccess } = access;
    const {
        selectedGroupId,
        layoutDirection,
        treeColumnCount,
        manualNodePositions,
        sourceHandlePosition,
        targetHandlePosition,
    } = opts;
    const isTopToBottom = computed(() => layoutDirection.value === "TB");

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
                position: snapPosition(manualNodePositions.value[group._id] ?? position),
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
                    (downstreamReach.value.get(b._id) ?? 0) -
                    (downstreamReach.value.get(a._id) ?? 0);
                if (reachDelta !== 0) return reachDelta;
                return a.name.localeCompare(b.name);
            };
            const byId = new Map(allGroups().map((group) => [group._id, group]));
            const neighbours = new Map(allGroups().map((group) => [group._id, new Set<string>()]));

            edges.value.forEach((edge) => {
                neighbours.get(edge.source)?.add(edge.target);
                neighbours.get(edge.target)?.add(edge.source);
            });

            const remaining = new Set(allGroups().map((group) => group._id));
            const clusters: GroupDto[][] = [];

            [...allGroups()].sort(sortByReach).forEach((group) => {
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
        [...allGroups()]
            .sort((a, b) => {
                const reachDelta =
                    (downstreamReach.value.get(b._id) ?? 0) -
                    (downstreamReach.value.get(a._id) ?? 0);
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
        const chartNodeIds = new Set(allGroups().map((group) => group._id));
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
                    type: "bezier",
                    animated: active,
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
                        // Both direct + inherited edges animate (active path flows), so
                        // each dash period must divide VueFlow's 10-unit `dashdraw` travel
                        // or the dashes teleport every cycle: "1 9" and "5 5" are period 10.
                        strokeDasharray: direct ? "1 9" : inherited ? "5 5" : undefined,
                        strokeLinecap: direct ? ("round" as const) : undefined,
                        strokeWidth: direct ? 3.2 : active ? 2.8 : 1.2,
                        opacity: active ? 1 : 0.2,
                    },
                };
            });
    });

    return { chartNodes, chartEdges };
}
