import { CatalogueEntry } from "../catalogue";
import { CouchClient } from "../lib/couch";

export type ExplainRow = {
    id: string;
    label: string;
    requested?: string;
    chosen: string;
    /** CouchDB honoured the requested index. */
    honoured: boolean;
    /** CouchDB fell back to the built-in `_all_docs` index — a full scan. */
    fullScan: boolean;
    note?: string;
};

/**
 * Ask CouchDB which index it would pick for each client-shaped query. This is the plan for
 * the query as the client sends it; the API additionally injects permission, status and
 * language clauses before executing, so a plan that looks fine here can still examine many
 * documents — the latency suite's `examined` column is the check on that.
 */
export async function runExplainSuite(
    couch: CouchClient,
    entries: CatalogueEntry[],
): Promise<ExplainRow[]> {
    const rows: ExplainRow[] = [];

    for (const entry of entries.filter((e) => e.explain)) {
        const requested: string | undefined = entry.explain.use_index;
        try {
            const plan = await couch.explain(entry.explain);
            const chosenDdoc = plan.index?.ddoc?.replace("_design/", "");
            const chosen = chosenDdoc ?? plan.index?.name ?? "unknown";
            const fullScan = plan.index?.type === "special" || plan.index?.name === "_all_docs";
            rows.push({
                id: entry.id,
                label: entry.label,
                requested,
                chosen,
                honoured: !requested || chosen === requested || plan.index?.name === requested,
                fullScan,
            });
        } catch (err: any) {
            rows.push({
                id: entry.id,
                label: entry.label,
                requested,
                chosen: "error",
                honoured: false,
                fullScan: false,
                note: String(err?.message ?? err).slice(0, 160),
            });
        }
    }

    return rows;
}
