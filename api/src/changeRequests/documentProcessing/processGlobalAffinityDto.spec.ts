import processGlobalAffinityDto from "./processGlobalAffinityDto";
import { GlobalAffinityDto } from "../../dto/GlobalAffinityDto";
import { DocType } from "../../enums";
import { GLOBAL_AFFINITY_ID } from "../../util/globalAffinity";

function makeDoc(overrides: Partial<GlobalAffinityDto> = {}): GlobalAffinityDto {
    return {
        _id: GLOBAL_AFFINITY_ID,
        type: DocType.GlobalAffinity,
        memberOf: ["group-public-content"],
        contribution: { "tag-a": 1 },
        ...overrides,
    } as GlobalAffinityDto;
}

describe("processGlobalAffinityDto", () => {
    it("forces the fixed singleton id regardless of what was submitted", () => {
        const doc = makeDoc({ _id: "some-other-id" });
        processGlobalAffinityDto(doc);
        expect(doc._id).toBe(GLOBAL_AFFINITY_ID);
    });

    it("strips a client-supplied affinity map — the field is server-owned", () => {
        const doc = makeDoc({ affinity: { "tag-evil": 1 } });
        processGlobalAffinityDto(doc);
        expect(doc.affinity).toBeUndefined();
    });

    it("strips client-supplied aggregate bookkeeping", () => {
        const doc = makeDoc({ lastDecayUtc: 1, contributionCount: 9999 });
        processGlobalAffinityDto(doc);
        expect(doc.lastDecayUtc).toBeUndefined();
        expect(doc.contributionCount).toBeUndefined();
    });

    it("re-normalizes a contribution to unit L1 rather than trusting the client's", () => {
        const doc = makeDoc({ contribution: { "tag-a": 30, "tag-b": 10 } });
        processGlobalAffinityDto(doc);
        expect(doc.contribution).toEqual({ "tag-a": 0.75, "tag-b": 0.25 });
    });

    it("preserves sign, so a negative signal stays negative", () => {
        const doc = makeDoc({ contribution: { "tag-a": 3, "tag-b": -1 } });
        processGlobalAffinityDto(doc);
        expect(doc.contribution!["tag-a"]).toBeCloseTo(0.75, 10);
        expect(doc.contribution!["tag-b"]).toBeCloseTo(-0.25, 10);
    });

    it("drops non-finite, non-numeric and zero entries", () => {
        const doc = makeDoc({
            contribution: {
                good: 1,
                nan: NaN,
                inf: Infinity,
                zero: 0,
                str: "5" as unknown as number,
            },
        });
        processGlobalAffinityDto(doc);
        expect(doc.contribution).toEqual({ good: 1 });
    });

    it("yields an empty contribution for a missing or degenerate one", () => {
        const missing = makeDoc({ contribution: undefined });
        processGlobalAffinityDto(missing);
        expect(missing.contribution).toEqual({});

        const allZero = makeDoc({ contribution: { a: 0, b: 0 } });
        processGlobalAffinityDto(allZero);
        expect(allZero.contribution).toEqual({});
    });
});
