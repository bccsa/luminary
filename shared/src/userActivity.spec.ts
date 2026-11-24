import { describe, it, expect } from "vitest";
import { userActivityDocumentId } from "./userActivity";

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
});
