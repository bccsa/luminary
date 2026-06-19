import type { ContentDto } from "luminary-shared";
import {
    keysForChangedDoc,
    keysForRecategorization,
    type DependencyKey,
} from "./facetKeys";

/** The route → dependency-keys manifest written to `dist-web/ssg-deps.json`. */
export type DepsManifest = Record<string, DependencyKey[]>;

/**
 * The stale set: every route whose recorded keys intersect the changed keys
 * (spec §3.4). Pure — shared by the deploy watcher and the simulation CLI.
 */
export function computeAffected(
    changedKeys: Iterable<DependencyKey>,
    manifest: DepsManifest,
): string[] {
    const changed = new Set(changedKeys);
    const routes = new Set<string>();
    for (const [route, keys] of Object.entries(manifest)) {
        if (keys.some((k) => changed.has(k))) routes.add(route);
    }
    return [...routes].sort();
}

export type SimulationResult = {
    changedKeys: DependencyKey[];
    routes: string[];
    /** stale routes ÷ total routes (0..1) — the measured fan-out (spec §3.4). */
    fanout: number;
};

/**
 * Non-destructive "what would change?" (spec §3.4). Given a (changed) doc and
 * the manifest, return the keys it touches, the stale routes, and the fan-out.
 * Pass `prevDoc` to model a re-categorization (old∪new tag union). A brand-new
 * doc not yet in the manifest contributes its own `/slug`.
 */
export function simulateAffected(
    doc: ContentDto,
    manifest: DepsManifest,
    prevDoc?: ContentDto,
): SimulationResult {
    const changedKeys = prevDoc ? keysForRecategorization(prevDoc, doc) : keysForChangedDoc(doc);
    const routes = new Set(computeAffected(changedKeys, manifest));
    if (doc.slug && !(`/${doc.slug}` in manifest)) routes.add(`/${doc.slug}`);
    const total = Object.keys(manifest).length || 1;
    return { changedKeys, routes: [...routes].sort(), fanout: routes.size / total };
}
