import { describe, expect, it, vi } from "vitest";
import { DocType, type MangoQuery } from "luminary-shared";
import { changedSinceQuery, fetchChangedDocs, watchCursor, type WatchDocBase } from "./watchPoll";

type TestDoc = WatchDocBase & { type: DocType; docType?: DocType };

function cursorFrom(query: MangoQuery) {
    const cursorClause = ((query.selector.$and as any[]) ?? []).find((clause) => clause.$or);
    const sameTimeClause = cursorClause.$or[1].$and;
    return watchCursor(sameTimeClause[0].updatedTimeUtc, sameTimeClause[1]._id.$gt);
}

function page(docs: TestDoc[], query: MangoQuery): TestDoc[] {
    const clauses = (query.selector.$and as any[]) ?? [];
    const type = clauses.find((clause) => clause.type)?.type;
    const docType = clauses.find((clause) => clause.docType)?.docType;
    const cursor = cursorFrom(query);

    return docs
        .filter((doc) => doc.type === type)
        .filter((doc) => !docType || doc.docType === docType)
        .filter(
            (doc) =>
                doc.updatedTimeUtc > cursor.updatedTimeUtc ||
                (doc.updatedTimeUtc === cursor.updatedTimeUtc &&
                    (doc._id ?? "").localeCompare(cursor._id) > 0),
        )
        .sort(
            (a, b) =>
                a.updatedTimeUtc - b.updatedTimeUtc ||
                a.type.localeCompare(b.type) ||
                (a._id ?? "").localeCompare(b._id ?? ""),
        )
        .slice(0, query.$limit);
}

describe("watchPoll", () => {
    it("builds an oldest-first indexed cursor query", () => {
        const query = changedSinceQuery({ type: DocType.Redirect }, watchCursor(123, "old"), 7);

        expect(query.$sort).toEqual([{ updatedTimeUtc: "asc" }, { type: "asc" }, { _id: "asc" }]);
        expect(query.$limit).toBe(7);
        expect(query.use_index).toBe("updatedTimeUtc-type-id-index");
        expect(cursorFrom(query)).toEqual(watchCursor(123, "old"));
    });

    it("drains multiple same-timestamp pages with the _id tie-breaker", async () => {
        const docs = Array.from({ length: 25 }, (_, i) => ({
            _id: `doc-${String(i).padStart(2, "0")}`,
            type: DocType.Content,
            updatedTimeUtc: 2000,
        }));
        const remote = vi.fn(async (query: MangoQuery) => page(docs, query));

        const result = await fetchChangedDocs(
            remote,
            { type: DocType.Content },
            watchCursor(1000),
            10,
        );

        expect(result.map((doc) => doc._id)).toEqual(docs.map((doc) => doc._id));
        expect(remote).toHaveBeenCalledTimes(3);
    });
});
