import { describe, expect, it } from "vitest";
import {
    advanceQueryCursor,
    buildKeysetQuery,
    drainQuery,
    enumerateDeleteCmds,
    enumeratePublicContent,
    QUERY_PAGE_SIZE,
    type KeysetDocument,
    type KeysetQuery,
    type QueryTransport,
} from "./queryDrain";

type TestDoc = KeysetDocument & { value: string };

function queuedTransport(pages: TestDoc[][], calls: KeysetQuery[]): QueryTransport {
    let page = 0;
    return async <T extends KeysetDocument>(query: KeysetQuery) => {
        calls.push(query);
        return (pages[page++] ?? []) as unknown as T[];
    };
}

describe("queryDrain", () => {
    it("advances the cursor to the final row on each full page", async () => {
        const calls: KeysetQuery[] = [];
        const first = [
            { updatedTimeUtc: 10, _id: "a", value: "a" },
            { updatedTimeUtc: 20, _id: "b", value: "b" },
        ];

        await drainQuery(queuedTransport([first, []], calls), {
            type: "language",
            limit: 2,
        });

        expect(calls[1].selector).toEqual({
            $and: [
                { type: "language" },
                {
                    $or: [
                        { updatedTimeUtc: { $gt: 20 } },
                        {
                            $and: [{ updatedTimeUtc: 20 }, { _id: { $gt: "b" } }],
                        },
                    ],
                },
            ],
        });
    });

    it("stops when a page is shorter than the limit", async () => {
        const calls: KeysetQuery[] = [];
        const docs = await drainQuery(
            queuedTransport([[{ updatedTimeUtc: 10, _id: "a", value: "a" }]], calls),
            { type: "redirect", limit: 2 },
        );

        expect(docs.map((doc) => doc._id)).toEqual(["a"]);
        expect(calls).toHaveLength(1);
    });

    it("drains multiple pages in order without duplicates or gaps", async () => {
        const calls: KeysetQuery[] = [];
        const docs = await drainQuery(
            queuedTransport(
                [
                    [
                        { updatedTimeUtc: 10, _id: "a", value: "a" },
                        { updatedTimeUtc: 20, _id: "b", value: "b" },
                    ],
                    [
                        { updatedTimeUtc: 30, _id: "c", value: "c" },
                        { updatedTimeUtc: 40, _id: "d", value: "d" },
                    ],
                    [{ updatedTimeUtc: 50, _id: "e", value: "e" }],
                ],
                calls,
            ),
            { type: "content", limit: 2 },
        );

        expect(docs.map((doc) => doc._id)).toEqual(["a", "b", "c", "d", "e"]);
        expect(calls).toHaveLength(3);
    });

    it("uses _id as the tiebreak when updatedTimeUtc is unchanged", () => {
        const cursor = advanceQueryCursor([
            { updatedTimeUtc: 100, _id: "same-time-a" },
            { updatedTimeUtc: 100, _id: "same-time-b" },
        ]);
        const query = buildKeysetQuery({ type: "content" }, cursor);

        expect(query.selector).toEqual({
            $and: [
                { type: "content" },
                {
                    $or: [
                        { updatedTimeUtc: { $gt: 100 } },
                        {
                            $and: [{ updatedTimeUtc: 100 }, { _id: { $gt: "same-time-b" } }],
                        },
                    ],
                },
            ],
        });
    });

    it("enumerates only public, already-published content", async () => {
        const now = 1_750_000_000_000;
        const calls: KeysetQuery[] = [];

        await enumeratePublicContent<TestDoc>(queuedTransport([[]], calls), now);

        expect(calls).toHaveLength(1);
        expect(calls[0].selector).toEqual({
            $and: [
                { type: "content" },
                { publishDate: { $lte: now } },
            ],
        });
    });

    describe("enumerateDeleteCmds", () => {
        it("queries a scalar docType with no ids filter", async () => {
            const calls: KeysetQuery[] = [];

            await enumerateDeleteCmds<TestDoc>(queuedTransport([[]], calls), "post");

            expect(calls).toHaveLength(1);
            expect(calls[0].selector).toEqual({
                $and: [{ type: "deleteCmd" }, { docType: "post" }],
            });
        });

        it("adds an _id $in filter when ids are given", async () => {
            const calls: KeysetQuery[] = [];

            await enumerateDeleteCmds<TestDoc>(queuedTransport([[]], calls), "redirect", [
                "cmd-1",
                "cmd-2",
            ]);

            expect(calls[0].selector).toEqual({
                $and: [
                    { type: "deleteCmd" },
                    { docType: "redirect" },
                    { _id: { $in: ["cmd-1", "cmd-2"] } },
                ],
            });
        });

        it("omits the _id filter when ids is empty", async () => {
            const calls: KeysetQuery[] = [];

            await enumerateDeleteCmds<TestDoc>(queuedTransport([[]], calls), "tag", []);

            expect(calls[0].selector).toEqual({
                $and: [{ type: "deleteCmd" }, { docType: "tag" }],
            });
        });

        it("drains multiple pages (a full first page triggers a second call)", async () => {
            const calls: KeysetQuery[] = [];
            const firstPage: TestDoc[] = Array.from({ length: QUERY_PAGE_SIZE }, (_, i) => ({
                updatedTimeUtc: i,
                _id: `id-${i}`,
                value: `v${i}`,
            }));
            const secondPage: TestDoc[] = [
                { updatedTimeUtc: QUERY_PAGE_SIZE, _id: "last", value: "last" },
            ];

            const docs = await enumerateDeleteCmds<TestDoc>(
                queuedTransport([firstPage, secondPage], calls),
                "post",
            );

            expect(calls).toHaveLength(2);
            expect(docs).toHaveLength(QUERY_PAGE_SIZE + 1);
            expect(docs[docs.length - 1]._id).toBe("last");
        });
    });
});
