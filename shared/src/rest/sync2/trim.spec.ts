import { describe, it, expect, beforeEach } from "vitest";
import { syncList } from "./state";
import { trim } from "./trim";
import { DocType } from "../../types";

/**
 * Tests for trim.ts
 */

describe("sync2 trim", () => {
    beforeEach(() => {
        syncList.value = [];
    });

    it("trims unused memberOf groups and sorts remaining", () => {
        syncList.value = [
            { chunkType: "post", memberOf: ["g2", "g1"], blockStart: 1000, blockEnd: 0 },
        ];

        trim({ type: DocType.Post, memberOf: ["g1"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].memberOf).toEqual(["g1"]); // sorted single group
    });

    it("removes entry when all groups trimmed away", () => {
        syncList.value = [{ chunkType: "post", memberOf: ["g2"], blockStart: 1000, blockEnd: 0 }];

        trim({ type: DocType.Post, memberOf: ["g1"] });

        expect(syncList.value).toHaveLength(0);
    });

    it("trims languages for content types", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["g1"],
                languages: ["en", "es"],
                blockStart: 1000,
                blockEnd: 0,
            },
        ];

        trim({ type: DocType.Content, subType: DocType.Post, memberOf: ["g1"], languages: ["en"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en"]);
    });

    it("removes content entry when all languages trimmed away", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["g1"],
                languages: ["en"],
                blockStart: 1000,
                blockEnd: 0,
            },
        ];

        trim({ type: DocType.Content, subType: DocType.Post, memberOf: ["g1"], languages: ["es"] });

        expect(syncList.value).toHaveLength(0);
    });

    it("does not trim languages for non-content types", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["g1"],
                // languages should be ignored since chunkType != content*
                languages: ["en", "es"],
                blockStart: 1000,
                blockEnd: 0,
            } as any,
        ];

        trim({ type: DocType.Post, memberOf: ["g1"], languages: ["en"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en", "es"]); // unchanged
    });

    it("retains languages when options.languages not provided", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["g1"],
                languages: ["en", "es"],
                blockStart: 1000,
                blockEnd: 0,
            },
        ];

        trim({ type: DocType.Content, subType: DocType.Post, memberOf: ["g1"] });

        expect(syncList.value[0].languages).toEqual(["en", "es"]);
    });

    it("sorts trimmed languages and groups", () => {
        syncList.value = [
            {
                chunkType: "content:post",
                memberOf: ["g2", "g1", "g3"],
                languages: ["es", "fr", "en"],
                blockStart: 1000,
                blockEnd: 0,
            },
        ];

        trim({
            type: DocType.Content,
            subType: DocType.Post,
            memberOf: ["g3", "g1"],
            languages: ["fr", "en"],
        });

        expect(syncList.value[0].memberOf).toEqual(["g1", "g3"]);
        expect(syncList.value[0].languages).toEqual(["en", "fr"]);
    });

    it("trims languages for deleteCmd entries with languages", () => {
        syncList.value = [
            {
                chunkType: "deleteCmd:post",
                memberOf: ["g1"],
                languages: ["en", "es"],
                blockStart: 1000,
                blockEnd: 0,
            },
        ];

        trim({
            type: DocType.DeleteCmd,
            subType: DocType.Post,
            memberOf: ["g1"],
            languages: ["en"],
        });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en"]);
    });

    it("removes deleteCmd entry when all languages trimmed away", () => {
        syncList.value = [
            {
                chunkType: "deleteCmd:post",
                memberOf: ["g1"],
                languages: ["en"],
                blockStart: 1000,
                blockEnd: 0,
            },
        ];

        trim({
            type: DocType.DeleteCmd,
            subType: DocType.Post,
            memberOf: ["g1"],
            languages: ["es"],
        });

        expect(syncList.value).toHaveLength(0);
    });

    it("does not trim languages for deleteCmd entries without languages", () => {
        syncList.value = [
            {
                chunkType: "deleteCmd:post",
                memberOf: ["g1"],
                blockStart: 1000,
                blockEnd: 0,
            },
        ];

        trim({
            type: DocType.DeleteCmd,
            subType: DocType.Post,
            memberOf: ["g1"],
            languages: ["en"],
        });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toBeUndefined();
    });

    it("only trims entries matching the specified type and subType", () => {
        syncList.value = [
            {
                chunkType: "post",
                memberOf: ["g1", "g2", "g3"],
                blockStart: 1000,
                blockEnd: 0,
            },
            {
                chunkType: "content:post",
                memberOf: ["g1", "g2", "g3"],
                languages: ["en", "es"],
                blockStart: 2000,
                blockEnd: 0,
            },
            {
                chunkType: "content:tag",
                memberOf: ["g1", "g2", "g3"],
                languages: ["en", "es"],
                blockStart: 3000,
                blockEnd: 0,
            },
        ];

        // Trim only content:post entries to keep only g1
        trim({ type: DocType.Content, subType: DocType.Post, memberOf: ["g1"], languages: ["en"] });

        // post entry should be unchanged (different type)
        expect(syncList.value[0].memberOf).toEqual(["g1", "g2", "g3"]);

        // content:post entry should be trimmed
        expect(syncList.value[1].memberOf).toEqual(["g1"]);
        expect(syncList.value[1].languages).toEqual(["en"]);

        // content:tag entry should be unchanged (different subType)
        expect(syncList.value[2].memberOf).toEqual(["g1", "g2", "g3"]);
        expect(syncList.value[2].languages).toEqual(["en", "es"]);
    });
});
