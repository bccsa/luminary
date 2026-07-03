import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "vue";
import type { NodeDragEvent } from "@vue-flow/core";
import type { GroupDto } from "luminary-shared";
import { useGroupGraphLayoutStorage } from "../useGroupGraphLayoutStorage";

const STORAGE_KEY = "group_graph_custom_layout";

function mkGroup(id: string): GroupDto {
    return { _id: id, name: id, acl: [] } as unknown as GroupDto;
}

/** Mounts the composable in a real (detached) app so onMounted fires. */
function withStorage(
    groups: GroupDto[],
): [ReturnType<typeof useGroupGraphLayoutStorage>, () => void] {
    let api!: ReturnType<typeof useGroupGraphLayoutStorage>;
    const app = createApp({
        setup() {
            api = useGroupGraphLayoutStorage(() => groups);
            return () => null;
        },
    });
    app.mount(document.createElement("div"));
    return [api, () => app.unmount()];
}

beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
});

describe("useGroupGraphLayoutStorage — readStoredLayout", () => {
    it("returns null when nothing is stored or JSON is invalid", () => {
        const [api, stop] = withStorage([mkGroup("A")]);
        expect(api.readStoredLayout()).toBeNull();

        localStorage.setItem(STORAGE_KEY, "not json");
        expect(api.readStoredLayout()).toBeNull();
        stop();
    });

    it("clamps treeColumnCount and filters invalid positions", () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                positions: { A: { x: 10, y: 20 }, B: { x: "bad", y: 1 } },
                layoutDirection: "LR",
                treeColumnCount: 999,
                groupIds: ["A"],
            }),
        );
        const [api, stop] = withStorage([mkGroup("A")]);
        const layout = api.readStoredLayout()!;

        expect(layout.layoutDirection).toBe("LR");
        expect(layout.treeColumnCount).toBe(8); // clamped to TREE_MAX_COLUMNS
        expect(layout.positions).toEqual({ A: { x: 10, y: 20 } }); // B dropped (invalid)
        stop();
    });
});

describe("useGroupGraphLayoutStorage — save / apply / clear", () => {
    it("applies a stored layout to the owned refs on mount", () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                positions: { A: { x: 22, y: 44 } },
                layoutDirection: "LR",
                treeColumnCount: 3,
                groupIds: ["A"],
            }),
        );
        const [api, stop] = withStorage([mkGroup("A")]);

        expect(api.layoutDirection.value).toBe("LR");
        expect(api.treeColumnCount.value).toBe(3);
        expect(api.manualNodePositions.value).toEqual({ A: { x: 22, y: 44 } });
        stop();
    });

    it("saveCustomLayout persists the current state and clearSavedLayout removes it", () => {
        const [api, stop] = withStorage([mkGroup("A")]);
        api.manualNodePositions.value = { A: { x: 10, y: 20 } };
        api.layoutDirection.value = "LR";

        api.saveCustomLayout();
        expect(api.savedLayout.value).not.toBeNull();
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).layoutDirection).toBe("LR");

        api.clearSavedLayout();
        expect(api.savedLayout.value).toBeNull();
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
        stop();
    });

    it("resetLayout clears manual positions only", () => {
        const [api, stop] = withStorage([mkGroup("A")]);
        api.manualNodePositions.value = { A: { x: 10, y: 20 } };
        api.resetLayout();
        expect(api.manualNodePositions.value).toEqual({});
        stop();
    });

    it("snaps positions to the grid and drops positions for unknown groups", () => {
        const [api, stop] = withStorage([mkGroup("A")]); // only A is a known group
        api.manualNodePositions.value = { A: { x: 25, y: 25 }, ghost: { x: 0, y: 0 } };

        // currentStoredLayout runs cleanPositions: ghost dropped, A snapped to GRID_SIZE (22)
        expect(api.currentStoredLayout().positions).toEqual({ A: { x: 22, y: 22 } });
        stop();
    });
});

describe("useGroupGraphLayoutStorage — hasUnsavedLayout", () => {
    it("is false with no manual positions, true once positions diverge from the saved layout", () => {
        const [api, stop] = withStorage([mkGroup("A")]);
        expect(api.hasUnsavedLayout.value).toBe(false);

        api.manualNodePositions.value = { A: { x: 22, y: 22 } };
        expect(api.hasUnsavedLayout.value).toBe(true);

        api.saveCustomLayout();
        expect(api.hasUnsavedLayout.value).toBe(false);
        stop();
    });
});

describe("useGroupGraphLayoutStorage — saveNodePosition", () => {
    it("merges dragged node positions into manualNodePositions", () => {
        const [api, stop] = withStorage([mkGroup("A"), mkGroup("B")]);

        api.saveNodePosition({
            node: { id: "A", position: { x: 10, y: 20 } },
            nodes: [],
        } as unknown as NodeDragEvent);
        expect(api.manualNodePositions.value).toEqual({ A: { x: 10, y: 20 } });

        // multi-select drag uses `nodes`
        api.saveNodePosition({
            node: { id: "ignored", position: { x: 0, y: 0 } },
            nodes: [{ id: "B", position: { x: 5, y: 6 } }],
        } as unknown as NodeDragEvent);
        expect(api.manualNodePositions.value).toEqual({
            A: { x: 10, y: 20 },
            B: { x: 5, y: 6 },
        });
        stop();
    });
});
