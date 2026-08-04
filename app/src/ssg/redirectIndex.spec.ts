import { describe, expect, it } from "vitest";
import { RedirectType } from "luminary-shared";
import { buildRedirectIndex } from "./redirectIndex";

describe("redirectIndex", () => {
    it("indexes only active redirect docs by id, with their HTTP status", () => {
        expect(
            buildRedirectIndex([
                { _id: "r1", slug: "old", toSlug: "new", redirectType: RedirectType.Permanent },
                { _id: "r2", slug: "deleted", toSlug: "target", deleteReq: 1 },
                { _id: "r3", slug: "empty" },
                { slug: "missing-id", toSlug: "target" },
            ]),
        ).toEqual({ r1: { slug: "old", status: 301 } });
    });

    it("defaults to a 302 (temporary) status when redirectType is missing", () => {
        expect(buildRedirectIndex([{ _id: "r1", slug: "old", toSlug: "new" }])).toEqual({
            r1: { slug: "old", status: 302 },
        });
    });

    it("gives a temporary redirect a 302 status", () => {
        expect(
            buildRedirectIndex([
                { _id: "r1", slug: "old", toSlug: "new", redirectType: RedirectType.Temporary },
            ]),
        ).toEqual({ r1: { slug: "old", status: 302 } });
    });
});
