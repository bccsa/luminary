import { describe, expect, it } from "vitest";
import { DeleteReason, redirectFile, routeForSlug, type SsgRouteIndex } from "luminary-shared";
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

    // A full build drains every DeleteCmd ever written, so these guards are what stop it
    // replaying the site's deletion history over the pages it just rendered.
    describe("buildDeleteQueue guards", () => {
        const cmd = { _id: "cmd-1", docId: "content-en", slug: "hello", updatedTimeUtc: 100 };

        it("skips a cmd whose target was rewritten after it (unpublish → republish)", () => {
            expect(
                buildDeleteQueue([cmd], [], undefined, undefined, {
                    liveDocs: new Map([["content-en", { updatedTimeUtc: 101 }]]),
                }),
            ).toEqual({});
        });

        it("still queues a cmd whose target genuinely predates it", () => {
            expect(
                buildDeleteQueue([cmd], [], undefined, undefined, {
                    liveDocs: new Map([["content-en", { updatedTimeUtc: 99 }]]),
                }),
            ).toEqual({
                "cmd-1": {
                    docType: "content",
                    docId: "content-en",
                    routes: ["/hello"],
                    files: ["hello.html"],
                },
            });
        });

        it("still queues a cmd whose target is absent — the doc really is gone", () => {
            expect(
                buildDeleteQueue([cmd], [], undefined, undefined, { liveDocs: new Map() }),
            ).toEqual({
                "cmd-1": {
                    docType: "content",
                    docId: "content-en",
                    routes: ["/hello"],
                    files: ["hello.html"],
                },
            });
        });

        // The bug this shipped for: a deleted redirect and a live content page resolve to the
        // same storage key, so the redirect's cmd removed a published page. No docId comparison
        // can catch it — the cmd's own target (the redirect doc) really was deleted.
        it("drops a dead redirect's route when a live page occupies that file", () => {
            expect(
                buildDeleteQueue(
                    [],
                    [{ _id: "cmd-2", docId: "r1", slug: "hello" }],
                    undefined,
                    undefined,
                    {
                        hasStaticFile: (file) => file === "hello.html",
                    },
                ),
            ).toEqual({});
        });

        it("keeps the routes of a parent cascade that no live page occupies", () => {
            expect(
                buildDeleteQueue(
                    [{ _id: "cmd-1", docId: "post-1" }],
                    [],
                    legacyRouteIndex,
                    undefined,
                    { hasStaticFile: (file) => file === "hello.html" },
                ),
            ).toEqual({
                "cmd-1": {
                    docType: "content",
                    docId: "post-1",
                    parentId: "post-1",
                    routes: ["/hola"],
                    files: ["hola.html"],
                },
            });
        });

        it("queues every resolved cmd when no guards are supplied", () => {
            expect(buildDeleteQueue([cmd], [], undefined, undefined)).toEqual({
                "cmd-1": {
                    docType: "content",
                    docId: "content-en",
                    routes: ["/hello"],
                    files: ["hello.html"],
                },
            });
        });
    });
});
