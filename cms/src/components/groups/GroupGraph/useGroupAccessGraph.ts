import { computed, type Ref } from "vue";
import type { GroupDto } from "luminary-shared";
import type { FlowEdge } from "./types";

/** Maps a group to its visual lane (LR layout) based on its name. Pure. */
export function chartLaneKey(group: GroupDto) {
    const name = group.name.toLowerCase();
    if (name.includes("super admin") || name.includes("admin")) return "admin";
    if (name.includes("content")) return "content";
    if (name.includes("editor")) return "editors";
    if (name.includes("user")) return "users";
    return "other";
}

/**
 * Derives the permission/access graph from group ACLs: the directed edges, the
 * downstream reach of every group, and the up/downstream access sets for the
 * currently selected group. Pure derivation — no DOM, no layout.
 */
export function useGroupAccessGraph(
    allGroups: () => GroupDto[],
    selectedGroupId: Ref<string | null>,
) {
    const edges = computed(() => {
        const knownIds = new Set(allGroups().map((group) => group._id));
        const edgeMap = new Map<string, FlowEdge>();

        for (const group of allGroups()) {
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

        allGroups().forEach((group) => {
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
                nextEdges(next).forEach((nextEdge) =>
                    queue.push({ edge: nextEdge, depth: depth + 1 }),
                );
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

    return { edges, downstreamReach, selectedAccess };
}
