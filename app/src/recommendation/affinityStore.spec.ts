import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import { defaultAffinity } from "luminary-shared";
import { affinityProfile, recordAffinity } from "./affinityStore";

describe("affinityStore", () => {
    beforeEach(async () => {
        localStorage.clear();
        affinityProfile.value = { affinity: {}, lastDecayUtc: undefined };
        defaultAffinity.value = undefined;
        await nextTick();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it("records an interaction into the local profile and persists it", () => {
        recordAffinity(["tag-a"]);

        expect(affinityProfile.value.affinity["tag-a"]).toBeGreaterThan(0);
        expect(
            JSON.parse(localStorage.getItem("affinityProfile")!).affinity["tag-a"],
        ).toBeGreaterThan(0);
    });

    it("does nothing for an empty/undefined tag list", () => {
        recordAffinity(undefined);
        recordAffinity([]);

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
        recordAffinity(["tag-a"]);
        defaultAffinity.value = { "tag-default": 0.8 };
        await nextTick();

        expect(affinityProfile.value.affinity["tag-a"]).toBeGreaterThan(0);
        expect(affinityProfile.value.affinity["tag-default"]).toBeUndefined();
    });
});
