import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nextTick } from "vue";
import { defaultAffinity, db, DocType, TagType } from "luminary-shared";
import { affinityProfile, recordAffinity } from "./affinityStore";

describe("affinityStore", () => {
    beforeEach(async () => {
        localStorage.clear();
        affinityProfile.value = { affinity: {}, lastDecayUtc: undefined };
        defaultAffinity.value = undefined;
        // recordAffinity only tracks TagType.Topic tags — seed "tag-a" as one.
        await db.docs.bulkPut([
            {
                _id: "tag-a",
                type: DocType.Tag,
                tagType: TagType.Topic,
                updatedTimeUtc: 0,
                memberOf: [],
                tags: [],
                publishDateVisible: false,
                pinned: 0,
            } as never,
        ]);
        await nextTick();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it("records an interaction into the local profile and persists it", async () => {
        const bulkGet = vi.spyOn(db.docs, "bulkGet");
        await recordAffinity(["tag-a"]);

        expect(bulkGet).toHaveBeenCalledWith(["tag-a"]);
        bulkGet.mockRestore();
        expect(affinityProfile.value.affinity["tag-a"]).toBeGreaterThan(0);
        expect(
            JSON.parse(localStorage.getItem("affinityProfile")!).affinity["tag-a"],
        ).toBeGreaterThan(0);
    });

    it("does nothing for an empty/undefined tag list", async () => {
        await recordAffinity(undefined);
        await recordAffinity([]);

        expect(affinityProfile.value.affinity).toEqual({});
    });

    it("seeds a previously unused client from the CMS default", async () => {
        defaultAffinity.value = { "tag-default": 0.8 };
        await nextTick();

        expect(affinityProfile.value.affinity).toEqual({ "tag-default": 0.8 });
        expect(JSON.parse(localStorage.getItem("affinityProfile")!).affinity).toEqual({
            "tag-default": 0.8,
        });
    });

    it("does not replace an existing local profile with a later default", async () => {
        await recordAffinity(["tag-a"]);
        defaultAffinity.value = { "tag-default": 0.8 };
        await nextTick();

        expect(affinityProfile.value.affinity["tag-a"]).toBeGreaterThan(0);
        expect(affinityProfile.value.affinity["tag-default"]).toBeUndefined();
    });
});
