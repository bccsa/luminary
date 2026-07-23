import processDefaultAffinityDto from "./processDefaultAffinityDto";
import { AffinityConfigDto, DefaultAffinityDto } from "../../dto/DefaultAffinityDto";
import { DocType } from "../../enums";
import { DEFAULT_AFFINITY_CONFIG, DEFAULT_AFFINITY_ID } from "../../util/defaultAffinity";

function makeDoc(
    affinity: Record<string, unknown>,
    id = DEFAULT_AFFINITY_ID,
    config?: Partial<AffinityConfigDto>,
): DefaultAffinityDto {
    return {
        _id: id,
        type: DocType.DefaultAffinity,
        memberOf: ["group-super-admins"],
        affinity: affinity as Record<string, number>,
        config: config as AffinityConfigDto,
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

    describe("config", () => {
        it("fills in the default config when none was submitted", () => {
            const doc = makeDoc({});
            processDefaultAffinityDto(doc);
            expect(doc.config).toEqual(DEFAULT_AFFINITY_CONFIG);
        });

        it("clamps out-of-range fields and falls back per-field to defaults when malformed", () => {
            const doc = makeDoc(
                {},
                DEFAULT_AFFINITY_ID,
                {
                    halfLifeDays: 999999,
                    hitWeight: 5,
                    minScore: 0,
                    maxTags: 5000,
                    depthScale: 0,
                    readFloorPercent: 150,
                    eventWeight: {
                        bookmark: 5,
                        bookmarkRemoved: NaN as unknown as number,
                        completion: 0.35,
                        readCompletion: 0.35,
                        highlight: 0.3,
                        highlightRemoved: -0.18,
                        impression: -0.02,
                    },
                } as Partial<AffinityConfigDto>,
            );
            processDefaultAffinityDto(doc);
            expect(doc.config?.halfLifeDays).toBe(3650);
            expect(doc.config?.hitWeight).toBe(1);
            expect(doc.config?.minScore).toBe(0.0001);
            expect(doc.config?.maxTags).toBe(500);
            expect(doc.config?.depthScale).toBe(1);
            expect(doc.config?.readFloorPercent).toBe(100);
            expect(doc.config?.eventWeight.bookmark).toBe(1);
            // Malformed field falls back to the default rather than being clamped to a bound.
            expect(doc.config?.eventWeight.bookmarkRemoved).toBe(
                DEFAULT_AFFINITY_CONFIG.eventWeight.bookmarkRemoved,
            );
        });

        it("passes through a well-formed config unchanged", () => {
            const custom: AffinityConfigDto = {
                halfLifeDays: 40,
                hitWeight: 0.05,
                minScore: 0.02,
                maxTags: 40,
                depthScale: 15,
                readFloorPercent: 15,
                eventWeight: {
                    bookmark: 0.2,
                    bookmarkRemoved: -0.1,
                    completion: 0.3,
                    readCompletion: 0.3,
                    highlight: 0.25,
                    highlightRemoved: -0.15,
                    impression: -0.01,
                },
            };
            const doc = makeDoc({}, DEFAULT_AFFINITY_ID, custom);
            processDefaultAffinityDto(doc);
            expect(doc.config).toEqual(custom);
        });
    });
});
