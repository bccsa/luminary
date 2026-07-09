import processUserAffinityDto from "./processUserAffinityDto";
import { UserAffinityDto } from "../../dto/UserAffinityDto";
import { DocType } from "../../enums";

function makeDoc(affinity: Record<string, unknown>, ownerId = "user-1"): UserAffinityDto {
    return {
        _id: `user-affinity-${ownerId}`,
        type: DocType.UserAffinity,
        ownerId: "someone-else",
        affinity: affinity as Record<string, number>,
    } as UserAffinityDto;
}

describe("processUserAffinityDto", () => {
    it("overwrites a client-supplied ownerId with the authenticated userId", () => {
        const doc = makeDoc({ "tag-a": 0.5 });
        processUserAffinityDto(doc, "user-1");
        expect(doc.ownerId).toBe("user-1");
    });

    it("clamps out-of-range scores into [0, 1]", () => {
        const doc = makeDoc({ high: 1.5, low: -0.5, ok: 0.4 });
        processUserAffinityDto(doc, "user-1");
        expect(doc.affinity).toEqual({ high: 1, low: 0, ok: 0.4 });
    });

    it("drops non-finite / non-numeric entries", () => {
        const doc = makeDoc({ good: 0.3, bad: NaN, alsoBad: "0.5", worse: Infinity });
        processUserAffinityDto(doc, "user-1");
        expect(doc.affinity).toEqual({ good: 0.3 });
    });

    it("caps the number of tags", () => {
        const many: Record<string, number> = {};
        for (let i = 0; i < 250; i++) many[`tag-${i}`] = 0.5;
        const doc = makeDoc(many);
        processUserAffinityDto(doc, "user-1");
        expect(Object.keys(doc.affinity)).toHaveLength(200);
    });
});
