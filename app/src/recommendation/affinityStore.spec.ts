import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import { db, DocType, PublishStatus, TagType, type ContentDto } from "luminary-shared";
import { defaultAffinity } from "./defaultAffinityStore";
import { affinityProfile, recordAffinity, migrateProfileToV2 } from "./affinityStore";

describe("affinityStore", () => {
    beforeEach(async () => {
        localStorage.clear();
        affinityProfile.value = { affinity: {}, lastDecayUtc: undefined };
        defaultAffinity.value = undefined;
        // App clients sync a tag's ContentDto, not its structural TagDto.
        const topicTagContent: ContentDto = {
            _id: "content-tag-a-lang-eng",
            type: DocType.Content,
            parentType: DocType.Tag,
            parentId: "tag-a",
            parentTagType: TagType.Topic,
            updatedTimeUtc: 0,
            memberOf: [],
            parentTags: [],
            language: "lang-eng",
            status: PublishStatus.Published,
            slug: "tag-a",
            title: "Tag A",
        };
        await db.docs.bulkPut([topicTagContent]);
        await nextTick();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it("records an interaction into the local profile and persists it", async () => {
        await recordAffinity(["tag-a"]);

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

    describe("v2 score-scale migration", () => {
        it("migrates pre-v2 scores to the finer (x0.01) scale and preserves lastDecayUtc", () => {
            const migrated = migrateProfileToV2({
                affinity: { "tag-old": 0.4, "tag-old2": 0.8 },
                lastDecayUtc: 12345,
            });
            expect(migrated.affinity["tag-old"]).toBeCloseTo(0.004, 10);
            expect(migrated.affinity["tag-old2"]).toBeCloseTo(0.008, 10);
            expect(migrated.lastDecayUtc).toBe(12345);
        });

        it("normalizes non-numeric entries to 0 during migration", () => {
            const migrated = migrateProfileToV2({
                affinity: { bad: "oops" as unknown as number, good: 0.2 },
                lastDecayUtc: undefined,
            });
            expect(migrated.affinity.bad).toBe(0);
            expect(migrated.affinity.good).toBeCloseTo(0.002, 10);
        });

        it("is a no-op on an empty profile", () => {
            const migrated = migrateProfileToV2({ affinity: {}, lastDecayUtc: undefined });
            expect(migrated.affinity).toEqual({});
        });

        it("stamps the v2 marker on persist so a freshly recorded profile is not re-migrated", async () => {
            // recordAffinity persists and must stamp the marker, otherwise the next load()
            // would shrink a new-scale profile by another x0.01.
            await recordAffinity(["tag-a"]);
            expect(localStorage.getItem("affinityProfile.v")).toBe("2");
            const stored = JSON.parse(localStorage.getItem("affinityProfile")!);
            // A single open on the new scale is hitWeight (0.0004), not the old 0.04.
            expect(stored.affinity["tag-a"]).toBeCloseTo(0.0004, 5);
        });
    });
});
