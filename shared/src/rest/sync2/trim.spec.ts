import { describe, it, expect, beforeEach } from "vitest";
import { syncList } from "./state";
import { trim } from "./trim";

/**
 * Tests for trim.ts
 */

describe("sync2 trim", () => {
    beforeEach(() => {
        syncList.value = [];
    });

    it("trims unused memberOf groups and sorts remaining", () => {
        syncList.value = [{ type: "post", memberOf: ["g2", "g1"], blockStart: 1000, blockEnd: 0 }];

        trim({ memberOf: ["g1"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].memberOf).toEqual(["g1"]); // sorted single group
    });

    it("removes entry when all groups trimmed away", () => {
        syncList.value = [{ type: "post", memberOf: ["g2"], blockStart: 1000, blockEnd: 0 }];

        trim({ memberOf: ["g1"] });

        expect(syncList.value).toHaveLength(0);
    });

    it("trims languages for content types", () => {
        syncList.value = [
            {
                type: "content:post",
                memberOf: ["g1"],
                languages: ["en", "es"],
                blockStart: 1000,
                blockEnd: 0,
            },
        ];

        trim({ memberOf: ["g1"], languages: ["en"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en"]);
    });

    it("removes content entry when all languages trimmed away", () => {
        syncList.value = [
            {
                type: "content:post",
                memberOf: ["g1"],
                languages: ["en"],
                blockStart: 1000,
                blockEnd: 0,
            },
        ];

        trim({ memberOf: ["g1"], languages: ["es"] });

        expect(syncList.value).toHaveLength(0);
    });

    it("does not trim languages for non-content types", () => {
        syncList.value = [
            {
                type: "post",
                memberOf: ["g1"],
                // languages should be ignored since type != content*
                languages: ["en", "es"],
                blockStart: 1000,
                blockEnd: 0,
            } as any,
        ];

        trim({ memberOf: ["g1"], languages: ["en"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].languages).toEqual(["en", "es"]); // unchanged
    });

    it("retains languages when options.languages not provided", () => {
        syncList.value = [
            {
                type: "content:post",
                memberOf: ["g1"],
                languages: ["en", "es"],
                blockStart: 1000,
                blockEnd: 0,
            },
        ];

        trim({ memberOf: ["g1"] });

        expect(syncList.value[0].languages).toEqual(["en", "es"]);
    });

    it("performs vertical merge after trimming (adjacent chunks)", () => {
        // Two adjacent chunks same group; trimming keeps both; they should merge into one.
        syncList.value = [
            { type: "post", memberOf: ["g1"], blockStart: 5000, blockEnd: 4000, eof: false },
            { type: "post", memberOf: ["g1"], blockStart: 4000, blockEnd: 3000, eof: false },
        ];

        trim({ memberOf: ["g1"] });

        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].blockStart).toBe(5000);
        expect(syncList.value[0].blockEnd).toBe(3000);
    });

    it("does not trigger horizontal merge when eof not reached", () => {
        // Two different groups, each with only one chunk and no eof merge -> eof will be false
        syncList.value = [
            { type: "post", memberOf: ["g1"], blockStart: 5000, blockEnd: 4000, eof: false },
            { type: "post", memberOf: ["g2"], blockStart: 4500, blockEnd: 3500, eof: false },
        ];

        trim({ memberOf: ["g1", "g2"] });

        // No vertical merges produce eof true, so horizontal merge should not happen
        expect(syncList.value).toHaveLength(2);
        const groups = syncList.value.map((e) => e.memberOf[0]).sort();
        expect(groups).toEqual(["g1", "g2"]);
    });

    it("triggers horizontal merge when vertical produced eof merges across groups", () => {
        // Each group has two chunks with second eof: true, vertical merge sets eof true overall
        syncList.value = [
            { type: "post", memberOf: ["g1"], blockStart: 5000, blockEnd: 4000, eof: false },
            { type: "post", memberOf: ["g1"], blockStart: 4000, blockEnd: 0, eof: true },
            { type: "post", memberOf: ["g2"], blockStart: 4500, blockEnd: 3500, eof: false },
            { type: "post", memberOf: ["g2"], blockStart: 3500, blockEnd: 0, eof: true },
        ];

        trim({ memberOf: ["g1", "g2"] });

        // Should have been horizontally merged into single entry with both groups
        expect(syncList.value).toHaveLength(1);
        expect(syncList.value[0].memberOf).toEqual(["g1", "g2"]);
        expect(syncList.value[0].blockStart).toBe(5000); // max
        expect(syncList.value[0].blockEnd).toBe(0); // min
    });

    it("sorts trimmed languages and groups", () => {
        syncList.value = [
            {
                type: "content:post",
                memberOf: ["g2", "g1", "g3"],
                languages: ["es", "fr", "en"],
                blockStart: 1000,
                blockEnd: 0,
            },
        ];

        trim({ memberOf: ["g3", "g1"], languages: ["fr", "en"] });

        expect(syncList.value[0].memberOf).toEqual(["g1", "g3"]);
        expect(syncList.value[0].languages).toEqual(["en", "fr"]);
    });
});
