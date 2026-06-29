import { describe, expect, it } from "vitest";
import { effectScope, ref } from "vue";
import type { GroupDto } from "luminary-shared";
import { chartLaneKey, useGroupAccessGraph } from "../useGroupAccessGraph";

/**
 * Builds a minimal GroupDto. `accessibleBy` lists the groupIds that hold a
 * non-empty permission over this group (i.e. this group's ACL entries) →
 * each produces an edge `source(accessor) → target(this group)`.
 */
function mkGroup(
    id: string,
    name: string,
    accessibleBy: Array<{ groupId: string; permission?: string[] }> = [],
): GroupDto {
    return {
        _id: id,
        name,
        acl: accessibleBy.map((a) => ({
            type: "post",
            groupId: a.groupId,
            permission: a.permission ?? ["view"],
        })),
    } as unknown as GroupDto;
}

/** Run a pure composable inside an effect scope and return its result. */
function inScope<T>(fn: () => T): T {
    const scope = effectScope();
    const result = scope.run(fn)!;
    scope.stop();
    return result;
}

describe("chartLaneKey", () => {
    it("maps names to lanes, admin winning over the rest", () => {
        expect(chartLaneKey(mkGroup("1", "Super Admin"))).toBe("admin");
        expect(chartLaneKey(mkGroup("1", "Admins"))).toBe("admin");
        expect(chartLaneKey(mkGroup("1", "Content editors"))).toBe("content"); // content before editor
        expect(chartLaneKey(mkGroup("1", "Editors"))).toBe("editors");
        expect(chartLaneKey(mkGroup("1", "Users"))).toBe("users");
        expect(chartLaneKey(mkGroup("1", "Something else"))).toBe("other");
    });
});

describe("useGroupAccessGraph — edges", () => {
    it("builds an edge per ACL accessor (source = accessor, target = owner)", () => {
        const groups = ref([mkGroup("A", "A"), mkGroup("B", "B", [{ groupId: "A" }])]);
        const { edges } = inScope(() => useGroupAccessGraph(() => groups.value, ref(null)));

        expect(edges.value).toEqual([{ id: "e-A__B", source: "A", target: "B" }]);
    });

    it("skips empty-permission, self-referential, and unknown-target ACL entries", () => {
        const groups = ref([
            mkGroup("A", "A"),
            mkGroup("B", "B", [
                { groupId: "A", permission: [] }, // empty permission → skipped
                { groupId: "B" }, // self → skipped
                { groupId: "ghost" }, // unknown group → skipped
            ]),
        ]);
        const { edges } = inScope(() => useGroupAccessGraph(() => groups.value, ref(null)));

        expect(edges.value).toEqual([]);
    });

    it("de-duplicates repeated accessor→owner pairs", () => {
        const groups = ref([
            mkGroup("A", "A"),
            mkGroup("B", "B", [{ groupId: "A" }, { groupId: "A", permission: ["edit"] }]),
        ]);
        const { edges } = inScope(() => useGroupAccessGraph(() => groups.value, ref(null)));

        expect(edges.value).toHaveLength(1);
    });

    it("recomputes when the source list changes", () => {
        const groups = ref([mkGroup("A", "A"), mkGroup("B", "B", [{ groupId: "A" }])]);
        const { edges } = inScope(() => useGroupAccessGraph(() => groups.value, ref(null)));
        expect(edges.value).toHaveLength(1);

        groups.value = [mkGroup("A", "A")];
        expect(edges.value).toEqual([]);
    });
});

describe("useGroupAccessGraph — downstreamReach", () => {
    it("counts every group reachable downstream (chain A→B→C)", () => {
        const groups = ref([
            mkGroup("A", "A"),
            mkGroup("B", "B", [{ groupId: "A" }]),
            mkGroup("C", "C", [{ groupId: "B" }]),
        ]);
        const { downstreamReach } = inScope(() =>
            useGroupAccessGraph(() => groups.value, ref(null)),
        );

        expect(downstreamReach.value.get("A")).toBe(2);
        expect(downstreamReach.value.get("B")).toBe(1);
        expect(downstreamReach.value.get("C")).toBe(0);
    });

    it("does not loop forever on cycles", () => {
        const groups = ref([
            mkGroup("A", "A", [{ groupId: "B" }]),
            mkGroup("B", "B", [{ groupId: "A" }]),
        ]);
        const { downstreamReach } = inScope(() =>
            useGroupAccessGraph(() => groups.value, ref(null)),
        );

        expect(downstreamReach.value.get("A")).toBe(1);
        expect(downstreamReach.value.get("B")).toBe(1);
    });
});

describe("useGroupAccessGraph — selectedAccess", () => {
    it("returns empty sets when nothing is selected", () => {
        const groups = ref([mkGroup("A", "A"), mkGroup("B", "B", [{ groupId: "A" }])]);
        const { selectedAccess } = inScope(() =>
            useGroupAccessGraph(() => groups.value, ref(null)),
        );

        const a = selectedAccess.value;
        expect(a.upstreamNodes.size).toBe(0);
        expect(a.downstreamNodes.size).toBe(0);
        expect(a.directEdges.size).toBe(0);
    });

    it("splits direct (depth 1) from inherited (deeper) on a chain A→B→C→D", () => {
        const groups = ref([
            mkGroup("A", "A"),
            mkGroup("B", "B", [{ groupId: "A" }]),
            mkGroup("C", "C", [{ groupId: "B" }]),
            mkGroup("D", "D", [{ groupId: "C" }]),
        ]);
        const selected = ref<string | null>("B");
        const { selectedAccess } = inScope(() => useGroupAccessGraph(() => groups.value, selected));

        const a = selectedAccess.value;
        // downstream: B→C is direct, C→D is inherited
        expect([...a.downstreamNodes].sort()).toEqual(["C", "D"]);
        expect(a.inheritedNodes.has("D")).toBe(true);
        expect(a.inheritedNodes.has("C")).toBe(false); // C is direct, removed from inherited
        // upstream: A→B is direct
        expect([...a.upstreamNodes]).toEqual(["A"]);
        expect(a.directEdges.has("e-A__B")).toBe(true);
        expect(a.directEdges.has("e-B__C")).toBe(true);
        expect(a.inheritedEdges.has("e-C__D")).toBe(true);
    });

    it("never includes the selected group itself in any node set (cycle A↔B)", () => {
        const groups = ref([
            mkGroup("A", "A", [{ groupId: "B" }]),
            mkGroup("B", "B", [{ groupId: "A" }]),
        ]);
        const selected = ref<string | null>("A");
        const { selectedAccess } = inScope(() => useGroupAccessGraph(() => groups.value, selected));

        const a = selectedAccess.value;
        expect(a.downstreamNodes.has("A")).toBe(false);
        expect(a.upstreamNodes.has("A")).toBe(false);
        expect(a.inheritedNodes.has("A")).toBe(false);
        expect(a.directNodes.has("A")).toBe(false);
    });

    it("recomputes when the selection changes", () => {
        const groups = ref([
            mkGroup("A", "A"),
            mkGroup("B", "B", [{ groupId: "A" }]),
            mkGroup("C", "C", [{ groupId: "B" }]),
        ]);
        const selected = ref<string | null>("A");
        const { selectedAccess } = inScope(() => useGroupAccessGraph(() => groups.value, selected));

        expect([...selectedAccess.value.downstreamNodes].sort()).toEqual(["B", "C"]);

        selected.value = "C";
        expect(selectedAccess.value.downstreamNodes.size).toBe(0);
        expect([...selectedAccess.value.upstreamNodes].sort()).toEqual(["A", "B"]);
    });
});
