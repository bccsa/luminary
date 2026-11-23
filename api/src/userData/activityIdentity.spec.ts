import {
    normalizeUserActivityDocument,
    toLegacyUserActivityDocument,
    userActivityDocumentId,
} from "./activityIdentity";

describe("activity document identity contract", () => {
    it.each([
        [{ type: "liked", parentId: "post-1" }, "03765424-5d56-5b37-802a-44a850aaaa65"],
        [{ type: "viewed", parentId: "post-1" }, "cef1ae4f-cd27-583b-b191-f460dec3612e"],
        [
            {
                type: "highlighted",
                parentId: "post-1",
                contentId: "content-1",
                range: { start: 0, end: 5 },
            },
            "42a5befd-bf84-5121-8caa-c784638f9adb",
        ],
    ])("matches the persistent UUID vector %j", (identity, expected) => {
        expect(userActivityDocumentId(identity as any)).toBe(expected);
    });

    it("changes a highlight id only when its passage identity changes", () => {
        const identity = {
            type: "highlighted" as const,
            parentId: "post",
            contentId: "content",
            range: { start: 0, end: 5 },
        };
        expect(userActivityDocumentId({ ...identity, parentId: "another-parent" })).toBe(
            userActivityDocumentId(identity),
        );
        expect(userActivityDocumentId({ ...identity, range: { start: 1, end: 5 } })).not.toBe(
            userActivityDocumentId(identity),
        );
    });

    it("migrates a removed passage without retaining its quotation", () => {
        const old = {
            _id: "highlighted:content:a:10-20",
            type: "userActivity",
            activityType: "highlighted",
            parentId: "post",
            contentId: "content:a",
            deleted: true,
            activityTimeUtc: 7,
            updatedTimeUtc: 12,
        };
        const doc = normalizeUserActivityDocument(old);
        expect(doc).toMatchObject({
            type: "highlighted",
            range: { start: 10, end: 20 },
            activityTimeUtc: 7,
            updatedTimeUtc: 12,
        });
        expect(doc._id).toMatch(/^[a-f0-9-]{36}$/);
        expect(doc).not.toHaveProperty("activityType");
        expect(toLegacyUserActivityDocument(doc)).toMatchObject(old);
    });

    it("round trips legacy active passages and keeps their activity time", () => {
        const old = {
            _id: "highlighted:content:0-5",
            type: "userActivity",
            activityType: "highlighted",
            parentId: "post",
            contentId: "content",
            activityTimeUtc: 7,
            updatedTimeUtc: 12,
            payload: { range: { start: 0, end: 5, color: "blue", text: "hello" } },
        };
        expect(toLegacyUserActivityDocument(normalizeUserActivityDocument(old))).toMatchObject(old);
    });

    it("rejects a legacy tombstone whose passage cannot be recovered", () => {
        expect(() =>
            normalizeUserActivityDocument({
                _id: "highlighted:content",
                type: "userActivity",
                activityType: "highlighted",
                parentId: "post",
                contentId: "content",
                deleted: true,
            }),
        ).toThrow();
    });
});
