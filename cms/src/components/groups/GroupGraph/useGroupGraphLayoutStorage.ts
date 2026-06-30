import { computed, onMounted, ref } from "vue";
import type { NodeDragEvent } from "@vue-flow/core";
import type { GroupDto } from "luminary-shared";
import {
    STORAGE_KEY,
    TREE_MAX_COLUMNS,
    TREE_MIN_COLUMNS,
    snapPosition,
    validPosition,
    type NodePosition,
    type StoredGraphLayout,
} from "./types";

/** Serializes a layout into a stable key for change detection (order-independent). */
function layoutKey(layout: StoredGraphLayout | null) {
    if (!layout) return "";
    const positions = Object.fromEntries(
        Object.entries(layout.positions).sort(([a], [b]) => a.localeCompare(b)),
    );
    return JSON.stringify({ ...layout, positions, groupIds: [...layout.groupIds].sort() });
}

/**
 * Owns the persisted layout state (direction, tree column count, manual node
 * positions, saved layout) and its localStorage I/O. Restores the saved layout
 * on mount.
 */
export function useGroupGraphLayoutStorage(allGroups: () => GroupDto[]) {
    const layoutDirection = ref<"LR" | "TB">("TB");
    const treeColumnCount = ref(4);
    const manualNodePositions = ref<Record<string, NodePosition>>({});
    const savedLayout = ref<StoredGraphLayout | null>(null);

    function cleanPositions(positions: Record<string, NodePosition>) {
        const groupIds = new Set(allGroups().map((group) => group._id));
        return Object.fromEntries(
            Object.entries(positions)
                .filter(([groupId, position]) => groupIds.has(groupId) && validPosition(position))
                .map(([groupId, position]) => [groupId, snapPosition(position)]),
        );
    }

    function currentStoredLayout(): StoredGraphLayout {
        const groupIds = allGroups()
            .map((group) => group._id)
            .sort();
        return {
            positions: cleanPositions(manualNodePositions.value),
            layoutDirection: layoutDirection.value,
            treeColumnCount: treeColumnCount.value,
            groupIds,
        };
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
    }

    function saveCustomLayout() {
        if (typeof localStorage === "undefined") return;

        const layout = currentStoredLayout();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
        savedLayout.value = layout;
    }

    function resetLayout() {
        manualNodePositions.value = {};
    }

    function clearSavedLayout() {
        if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
        savedLayout.value = null;
    }

    function updateTreeColumnCount(event: Event) {
        treeColumnCount.value = Number((event.target as HTMLInputElement).value);
    }

    function saveNodePosition({ node, nodes }: NodeDragEvent) {
        const movedNodes = nodes.length ? nodes : [node];
        const movedPositions = Object.fromEntries(
            movedNodes.map((movedNode) => [
                movedNode.id,
                { x: movedNode.position.x, y: movedNode.position.y },
            ]),
        );
        if (
            movedNodes.every((movedNode) => {
                const position = manualNodePositions.value[movedNode.id];
                return (
                    position?.x === movedNode.position.x && position?.y === movedNode.position.y
                );
            })
        )
            return;

        manualNodePositions.value = {
            ...manualNodePositions.value,
            ...movedPositions,
        };
    }

    const hasManualNodePositions = computed(
        () => Object.keys(cleanPositions(manualNodePositions.value)).length > 0,
    );
    const hasUnsavedLayout = computed(
        () =>
            hasManualNodePositions.value &&
            layoutKey(currentStoredLayout()) !== layoutKey(savedLayout.value),
    );

    onMounted(() => {
        savedLayout.value = readStoredLayout();
        applyStoredLayout();
    });

    return {
        layoutDirection,
        treeColumnCount,
        manualNodePositions,
        savedLayout,
        readStoredLayout,
        applyStoredLayout,
        saveCustomLayout,
        resetLayout,
        clearSavedLayout,
        currentStoredLayout,
        updateTreeColumnCount,
        saveNodePosition,
        hasManualNodePositions,
        hasUnsavedLayout,
    };
}
