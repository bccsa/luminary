import { Position } from "@vue-flow/core";

export type FlowEdge = {
    id: string;
    source: string;
    target: string;
};

export type ChartNode = {
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

export type NodePosition = { x: number; y: number };
export type StoredGraphLayout = {
    positions: Record<string, NodePosition>;
    layoutDirection: "LR" | "TB";
    treeColumnCount: number;
    groupIds: string[];
};

export const CHART_COLUMN_WIDTH = 320;
export const CHART_ROW_HEIGHT = 104;
export const CHART_TOP_OFFSET = 120;
export const CHART_CARD_WIDTH = 240;
export const TREE_COLUMN_WIDTH = 280;
export const TREE_ROW_HEIGHT = 120;
export const TREE_MIN_COLUMNS = 1;
export const TREE_MAX_COLUMNS = 8;
export const GRID_SIZE = 22;
export const KEYBOARD_PAN_STEP = 80;
export const STORAGE_KEY = "group_graph_custom_layout";

export const chartLanes = [
    { key: "admin", title: "Admin" },
    { key: "users", title: "Users" },
    { key: "editors", title: "Editors" },
    { key: "content", title: "Content" },
    { key: "other", title: "Other" },
] as const;

export function validPosition(position: unknown): position is NodePosition {
    return (
        !!position &&
        typeof position === "object" &&
        Number.isFinite((position as NodePosition).x) &&
        Number.isFinite((position as NodePosition).y)
    );
}

export function snapPosition(position: NodePosition): NodePosition {
    return {
        x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
        y: Math.round(position.y / GRID_SIZE) * GRID_SIZE,
    };
}
