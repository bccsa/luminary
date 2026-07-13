import { describe, expect, it } from "vitest";
import { buildRouteIndex, resolveContentDelete, routeForSlug } from "./routeIndex";

describe("routeIndex", () => {
    const index = buildRouteIndex([
        { _id: "content-en", parentId: "post-1", slug: "hello" },
        { _id: "content-es", parentId: "post-1", slug: "/hola" },
        { _id: "content-other", parentId: "post-2", slug: "other" },
    ]);

    it("resolves a content-id delete to one slug route", () => {
        expect(resolveContentDelete("content-en", index)).toEqual({
            parentId: "post-1",
            routes: ["/hello"],
        });
    });

    it("resolves a parent-id delete to all translation slug routes", () => {
        expect(resolveContentDelete("post-1", index)).toEqual({
            parentId: "post-1",
            routes: ["/hello", "/hola"],
        });
    });

    it("ignores unknown delete ids", () => {
        expect(resolveContentDelete("missing", index)).toEqual({ routes: [] });
    });

    it("normalizes slugs to routes", () => {
        expect(routeForSlug("/hello")).toBe("/hello");
        expect(routeForSlug("hello")).toBe("/hello");
    });
});
