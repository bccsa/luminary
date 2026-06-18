import { DbQueryResult } from "../db/db.service";

export type ExpensiveQueryThresholds = {
    /** A query examining more than this many docs is expensive regardless of ratio. */
    docsExamined: number;
    /** A query whose examined/returned ratio exceeds this is expensive (above the floor). */
    examinedRatio: number;
};

export type CostVerdict = {
    expensive: boolean;
    reason?: "docs_examined" | "examined_ratio";
    docsExamined: number;
    /** examined / max(returned, 1) — handy for logs. */
    ratio: number;
};

/**
 * Below this many examined docs a query is never flagged via the ratio rule — a tiny
 * query that examines 10 docs to return 1 has a ratio of 10 but is not a problem.
 */
const RATIO_FLOOR_DOCS = 100;

/**
 * Classify a completed `/query` as expensive (likely a full / large table scan) from
 * CouchDB's `execution_stats`. Pure — all stats fields are runtime-guarded because
 * `execution_stats` (and individual fields) may be absent depending on CouchDB
 * version / whether stats were requested.
 *
 * Expensive when:
 *  - `total_docs_examined` exceeds the absolute `docsExamined` threshold, OR
 *  - at least `RATIO_FLOOR_DOCS` were examined AND examined/returned exceeds
 *    `examinedRatio`.
 */
export function classifyQueryCost(
    stats: DbQueryResult["execution_stats"] | undefined,
    resultsReturned: number,
    thresholds: ExpensiveQueryThresholds,
): CostVerdict {
    const docsExamined =
        stats && typeof stats.total_docs_examined === "number" ? stats.total_docs_examined : 0;
    const returned = typeof resultsReturned === "number" && resultsReturned > 0 ? resultsReturned : 1;
    const ratio = docsExamined / returned;

    if (docsExamined > thresholds.docsExamined) {
        return { expensive: true, reason: "docs_examined", docsExamined, ratio };
    }
    if (docsExamined >= RATIO_FLOOR_DOCS && ratio > thresholds.examinedRatio) {
        return { expensive: true, reason: "examined_ratio", docsExamined, ratio };
    }
    return { expensive: false, docsExamined, ratio };
}
