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
