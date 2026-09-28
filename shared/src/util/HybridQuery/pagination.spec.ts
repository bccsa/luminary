import { describe, expect, it } from "vitest";
import type { BaseDocumentDto } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import { paginateByLimit } from "./pagination";

const doc = (id: string) => ({ _id: id, updatedTimeUtc: 1, type: "content" }) as BaseDocumentDto;
const filled = [doc("a"), doc("b")];
const query = { selector: { type: "content" }, $limit: 2 } as MangoQuery;

describe("paginateByLimit", () => {
    const page = paginateByLimit<BaseDocumentDto>(10);

    it("widens $limit by the page size, keeping the query cumulative", () => {
        expect(page.next(query, filled)).toEqual({ ...query, $limit: 12 });
    });

    it("preserves the rest of the query so routing and sorting are unchanged", () => {
        const sorted = {
            ...query,
            $sort: [{ publishDate: "desc" }],
            use_index: "ix",
        } as MangoQuery;
        const next = page.next(sorted, filled)!;
        expect(next.selector).toBe(sorted.selector);
        expect(next.$sort).toBe(sorted.$sort);
        expect(next.use_index).toBe("ix");
    });

    it("stops once the settled window under-fills its limit", () => {
        expect(page.next(query, [doc("a")])).toBeUndefined();
    });

    it("never extends an unbounded query", () => {
        expect(page.next({ selector: { type: "content" } } as MangoQuery, filled)).toBeUndefined();
    });

    it("is inert for a non-positive page size", () => {
        expect(paginateByLimit<BaseDocumentDto>(0).next(query, filled)).toBeUndefined();
    });

    it("is pure — the session calls it to test for a further slice and discards it", () => {
        const before = JSON.stringify(query);
        page.next(query, filled);
        page.next(query, filled);
        expect(JSON.stringify(query)).toBe(before);
    });
});
