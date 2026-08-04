import { describe, expect, it } from "vitest";
import { DeleteReason } from "luminary-shared";
import { redirectFile } from "./redirectHtml";
import { routeForSlug, type SsgRouteIndex } from "./routeIndex";
import {
    buildDeleteQueue,
    resolveContentDeleteQueueEntry,
    resolveRedirectDeleteQueueEntry,
    routeToStaticFile,
} from "./deleteQueue";

const legacyRouteIndex: SsgRouteIndex = {
    content: { "content-en": { route: "/hello", parentId: "post-1" } },
    parent: { "post-1": ["/hello", "/hola"] },
};

describe("deleteQueue", () => {
    describe("routeToStaticFile", () => {
        it("strips the leading slash and appends .html", () => {
            expect(routeToStaticFile("/hello")).toBe("hello.html");
            expect(routeToStaticFile("/en/explore")).toBe("en/explore.html");
        });

        it("never diverges from redirectHtml.ts's redirectFile for the same slug", () => {
            for (const slug of ["hello", "/hola", "en/explore", "/a/b/c"]) {
                expect(routeToStaticFile(routeForSlug(slug))).toBe(redirectFile(slug));
            }
        });
    });

    describe("resolveContentDeleteQueueEntry", () => {
        it("resolves a new-style (slug-bearing) cmd to a single-route entry with no parentId", () => {
            expect(resolveContentDeleteQueueEntry({ docId: "content-en", slug: "hello" })).toEqual({
                docType: "content",
                docId: "content-en",
                routes: ["/hello"],
                files: ["hello.html"],
            });
        });

        it("falls back to the legacy route index for a single translation", () => {
            expect(
                resolveContentDeleteQueueEntry({ docId: "content-en" }, legacyRouteIndex),
            ).toEqual({
                docType: "content",
                docId: "content-en",
                parentId: "post-1",
                routes: ["/hello"],
                files: ["hello.html"],
            });
        });

        it("falls back to the legacy route index for a whole-parent cascade", () => {
            expect(resolveContentDeleteQueueEntry({ docId: "post-1" }, legacyRouteIndex)).toEqual({
                docType: "content",
                docId: "post-1",
                parentId: "post-1",
                routes: ["/hello", "/hola"],
                files: ["hello.html", "hola.html"],
            });
        });

        it("is unresolvable without a slug and without a legacy index", () => {
            expect(resolveContentDeleteQueueEntry({ docId: "content-en" })).toBeUndefined();
        });

        it("is unresolvable when the legacy index has no matching entry", () => {
            expect(
                resolveContentDeleteQueueEntry({ docId: "missing" }, legacyRouteIndex),
            ).toBeUndefined();
        });

        it("is unresolvable without a docId", () => {
            expect(resolveContentDeleteQueueEntry({ slug: "hello" })).toBeUndefined();
        });

        it("carries the DeleteCmd's own fields through, since nothing here leaves the server", () => {
            expect(
                resolveContentDeleteQueueEntry({
                    docId: "content-en",
                    slug: "hello",
                    deleteReason: DeleteReason.StatusChange,
                    language: "lang-1",
                    memberOf: ["group-1"],
                    newMemberOf: ["group-2"],
                }),
            ).toEqual({
                docType: "content",
                docId: "content-en",
                deleteReason: DeleteReason.StatusChange,
                language: "lang-1",
                memberOf: ["group-1"],
                newMemberOf: ["group-2"],
                routes: ["/hello"],
                files: ["hello.html"],
            });
        });
    });

    describe("resolveRedirectDeleteQueueEntry", () => {
        it("resolves a new-style (slug-bearing) cmd", () => {
            expect(resolveRedirectDeleteQueueEntry({ docId: "r1", slug: "old" })).toEqual({
                docType: "redirect",
                docId: "r1",
                routes: ["/old"],
                files: ["old.html"],
            });
        });

        it("falls back to a legacy slug", () => {
            expect(resolveRedirectDeleteQueueEntry({ docId: "r1" }, "old")).toEqual({
                docType: "redirect",
                docId: "r1",
                routes: ["/old"],
                files: ["old.html"],
            });
        });

        it("is unresolvable without a slug from either source", () => {
            expect(resolveRedirectDeleteQueueEntry({ docId: "r1" })).toBeUndefined();
        });

        it("is unresolvable without a docId", () => {
            expect(resolveRedirectDeleteQueueEntry({ slug: "old" })).toBeUndefined();
        });
    });

    describe("buildDeleteQueue", () => {
        it("merges content and redirect cmds into one id-keyed queue", () => {
            expect(
                buildDeleteQueue(
                    [{ _id: "cmd-1", docId: "content-en", slug: "hello" }],
                    [{ _id: "cmd-2", docId: "r1", slug: "old" }],
                ),
            ).toEqual({
                "cmd-1": {
                    docType: "content",
                    docId: "content-en",
                    routes: ["/hello"],
                    files: ["hello.html"],
                },
                "cmd-2": {
                    docType: "redirect",
                    docId: "r1",
                    routes: ["/old"],
                    files: ["old.html"],
                },
            });
        });

        it("drops cmds lacking a DeleteCmd _id", () => {
            expect(buildDeleteQueue([{ docId: "content-en", slug: "hello" }], [])).toEqual({});
        });

        it("drops unresolvable cmds silently", () => {
            expect(buildDeleteQueue([{ _id: "cmd-1", docId: "content-en" }], [])).toEqual({});
        });

        it("uses legacy fallbacks passed through for both content and redirect", () => {
            expect(
                buildDeleteQueue(
                    [{ _id: "cmd-1", docId: "content-en" }],
                    [{ _id: "cmd-2", docId: "r1" }],
                    legacyRouteIndex,
                    { r1: "old" },
                ),
            ).toEqual({
                "cmd-1": {
                    docType: "content",
                    docId: "content-en",
                    parentId: "post-1",
                    routes: ["/hello"],
                    files: ["hello.html"],
                },
                "cmd-2": {
                    docType: "redirect",
                    docId: "r1",
                    routes: ["/old"],
                    files: ["old.html"],
                },
            });
        });
    });
});
