import { describe, expect, it } from "vitest";
import {
    advanceQueryCursor,
    buildKeysetQuery,
    drainQuery,
    enumeratePublicContent,
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
                { parentType: { $in: ["post", "tag"] } },
                { publishDate: { $lte: now } },
            ],
        });
    });
});
