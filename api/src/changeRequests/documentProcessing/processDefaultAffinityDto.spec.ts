import processDefaultAffinityDto from "./processDefaultAffinityDto";
import { DefaultAffinityDto } from "../../dto/DefaultAffinityDto";
import { DocType } from "../../enums";
import { DEFAULT_AFFINITY_ID } from "../../util/userAffinity";

function makeDoc(affinity: Record<string, unknown>, id = DEFAULT_AFFINITY_ID): DefaultAffinityDto {
    return {
        _id: id,
        type: DocType.DefaultAffinity,
        memberOf: ["group-super-admins"],
        affinity: affinity as Record<string, number>,
    } as DefaultAffinityDto;
}

describe("processDefaultAffinityDto", () => {
    it("forces the fixed singleton id regardless of what was submitted", () => {
        const doc = makeDoc({ "tag-a": 0.5 }, "some-other-id");
        processDefaultAffinityDto(doc);
        expect(doc._id).toBe(DEFAULT_AFFINITY_ID);
    });

    it("clamps out-of-range scores into [0, 1]", () => {
        const doc = makeDoc({ high: 1.5, low: -0.5, ok: 0.4 });
        processDefaultAffinityDto(doc);
        expect(doc.affinity).toEqual({ high: 1, low: 0, ok: 0.4 });
    });

    it("drops non-finite / non-numeric entries", () => {
        const doc = makeDoc({ good: 0.3, bad: NaN, alsoBad: "0.5" });
        processDefaultAffinityDto(doc);
        expect(doc.affinity).toEqual({ good: 0.3 });
    });

    it("caps the number of tags", () => {
        const many: Record<string, number> = {};
        for (let i = 0; i < 250; i++) many[`tag-${i}`] = 0.5;
        const doc = makeDoc(many);
        processDefaultAffinityDto(doc);
        expect(Object.keys(doc.affinity)).toHaveLength(200);
    });
});
