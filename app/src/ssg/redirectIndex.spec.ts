import { describe, expect, it } from "vitest";
import { buildRedirectIndex } from "./redirectIndex";

describe("redirectIndex", () => {
    it("indexes only active redirect docs by id", () => {
        expect(
            buildRedirectIndex([
                { _id: "r1", slug: "old", toSlug: "new" },
                { _id: "r2", slug: "deleted", toSlug: "target", deleteReq: 1 },
                { _id: "r3", slug: "empty" },
                { slug: "missing-id", toSlug: "target" },
            ]),
        ).toEqual({ r1: "old" });
    });
});
