import { GlobalAffinityService } from "./globalAffinity.service";
import { DocType } from "../enums";
import { GLOBAL_AFFINITY_ID } from "../util/globalAffinity";
import { DEFAULT_AFFINITY_CONFIG, DEFAULT_AFFINITY_ID } from "../util/defaultAffinity";

const LEARNING_RATE = DEFAULT_AFFINITY_CONFIG.global.learningRate;

describe("GlobalAffinityService", () => {
    /**
     * Minimal DbService stand-in holding the two singletons in memory, so a flush can be
     * observed as the document it actually writes.
     */
    function mockDb(
        globalDoc: any = {
            _id: GLOBAL_AFFINITY_ID,
            type: DocType.GlobalAffinity,
            memberOf: ["group-public-content"],
            affinity: {},
        },
        globalConfigOverride?: Partial<typeof DEFAULT_AFFINITY_CONFIG.global>,
    ) {
        const store: Record<string, any> = {
            [DEFAULT_AFFINITY_ID]: {
                _id: DEFAULT_AFFINITY_ID,
                type: DocType.DefaultAffinity,
                config: {
                    ...DEFAULT_AFFINITY_CONFIG,
                    global: { ...DEFAULT_AFFINITY_CONFIG.global, ...globalConfigOverride },
                },
            },
        };
        if (globalDoc) store[GLOBAL_AFFINITY_ID] = globalDoc;

        const written: any[] = [];
        const db = {
            getDoc: jest.fn(async (id: string) => ({ docs: store[id] ? [store[id]] : [] })),
            upsertDoc: jest.fn(async (doc: any) => {
                store[doc._id] = doc;
                written.push(doc);
                return { ok: true };
            }),
        } as any;
        return { db, written, store };
    }

    /** One client's contribution: a raw vector, normalized to one vote by `contribute`. */
    const vote = (tags: Record<string, number>) => tags;

    describe("normalization — one client, one vote", () => {
        it("scales a contribution to unit L1 however large the raw numbers are", async () => {
            const { db, written } = mockDb();
            const service = new GlobalAffinityService(db);

            // Ten times the magnitude of a single-tag vote, but still one vote.
            service.contribute(vote({ "tag-a": 50 }));
            await service.flush();

            expect(written[0].affinity["tag-a"]).toBeCloseTo(LEARNING_RATE, 10);
        });

        it("splits one vote across the tags a client engaged with", async () => {
            const { db, written } = mockDb();
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ "tag-a": 3, "tag-b": 1 }));
            await service.flush();

            // 0.75 / 0.25 of one vote's worth. Compounding makes these fractionally larger
            // than the linear split at a rate this small, hence the loose precision.
            expect(written[0].affinity["tag-a"]).toBeCloseTo(LEARNING_RATE * 0.75, 6);
            expect(written[0].affinity["tag-b"]).toBeCloseTo(LEARNING_RATE * 0.25, 6);
            const total = written[0].affinity["tag-a"] + written[0].affinity["tag-b"];
            expect(total).toBeCloseTo(LEARNING_RATE, 5);
        });

        it("bounds one client's influence on a single tag by the learning rate", async () => {
            const { db, written } = mockDb();
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ "tag-a": 1 }));
            await service.flush();

            // A whole vote on one tag is exactly one application of the rate.
            expect(written[0].affinity["tag-a"]).toBeCloseTo(LEARNING_RATE, 12);
        });

        it("drops non-finite and zero entries", async () => {
            const { db, written } = mockDb();
            const service = new GlobalAffinityService(db);

            service.contribute(
                vote({ good: 1, nan: NaN, inf: Infinity, zero: 0 } as Record<string, number>),
            );
            await service.flush();

            expect(Object.keys(written[0].affinity)).toEqual(["good"]);
        });
    });

    describe("accumulation", () => {
        it("converges toward 1 as many clients vote for the same tag", async () => {
            const { db, written } = mockDb();
            const service = new GlobalAffinityService(db);

            for (let i = 0; i < 200; i++) service.contribute(vote({ "tag-a": 1 }));
            await service.flush();

            const score = written[0].affinity["tag-a"];
            // 200 votes land meaningfully above one vote, but nowhere near saturation:
            // a real shift in the aggregate takes a real number of people.
            expect(score).toBeGreaterThan(LEARNING_RATE * 100);
            expect(score).toBeLessThan(0.6);
        });

        it("keeps scores below 1 no matter how large a single batch is", async () => {
            const { db, written } = mockDb();
            const service = new GlobalAffinityService(db);

            for (let i = 0; i < 5000; i++) service.contribute(vote({ "tag-a": 1 }));
            await service.flush();

            expect(written[0].affinity["tag-a"]).toBeLessThan(1);
            expect(written[0].affinity["tag-a"]).toBeGreaterThan(0.9);
        });

        it("lands on the same score whether votes share a flush or not", async () => {
            const batched = mockDb();
            const batchedService = new GlobalAffinityService(batched.db);
            for (let i = 0; i < 100; i++) batchedService.contribute(vote({ "tag-a": 1 }));
            await batchedService.flush();

            const spread = mockDb();
            const spreadService = new GlobalAffinityService(spread.db);
            for (let i = 0; i < 100; i++) {
                spreadService.contribute(vote({ "tag-a": 1 }));
                await spreadService.flush();
            }

            const batchedScore = batched.written.at(-1).affinity["tag-a"];
            const spreadScore = spread.written.at(-1).affinity["tag-a"];
            expect(batchedScore).toBeCloseTo(spreadScore, 6);
        });

        it("counts every contribution in contributionCount", async () => {
            const { db, written } = mockDb();
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ "tag-a": 1 }));
            service.contribute(vote({ "tag-b": 1 }));
            await service.flush();

            expect(written[0].contributionCount).toBe(2);
        });

        it("adds to an existing aggregate rather than replacing it", async () => {
            const { db, written } = mockDb({
                _id: GLOBAL_AFFINITY_ID,
                type: DocType.GlobalAffinity,
                memberOf: ["group-public-content"],
                affinity: { "tag-existing": 0.5 },
                contributionCount: 10,
            });
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ "tag-new": 1 }));
            await service.flush();

            expect(written[0].affinity["tag-existing"]).toBeCloseTo(0.5, 6);
            expect(written[0].affinity["tag-new"]).toBeGreaterThan(0);
            expect(written[0].contributionCount).toBe(11);
        });

        it("ignores a negative signal on a tag with no evidence yet", async () => {
            const { db, written } = mockDb();
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ "tag-unknown": -1 }));
            await service.flush();

            expect(written[0].affinity["tag-unknown"]).toBeUndefined();
        });

        it("pulls an established tag down on a negative signal, never below zero", async () => {
            const { db, written } = mockDb({
                _id: GLOBAL_AFFINITY_ID,
                type: DocType.GlobalAffinity,
                memberOf: ["group-public-content"],
                affinity: { "tag-a": 0.5 },
            });
            const service = new GlobalAffinityService(db);

            for (let i = 0; i < 50; i++) service.contribute(vote({ "tag-a": -1 }));
            await service.flush();

            expect(written[0].affinity["tag-a"]).toBeLessThan(0.5);
            expect(written[0].affinity["tag-a"]).toBeGreaterThan(0);
        });
    });

    describe("decay and capping", () => {
        it("halves scores after one half-life", async () => {
            const halfLifeDays = DEFAULT_AFFINITY_CONFIG.global.halfLifeDays;
            const dayMs = 24 * 60 * 60 * 1000;
            const { db, written } = mockDb({
                _id: GLOBAL_AFFINITY_ID,
                type: DocType.GlobalAffinity,
                memberOf: ["group-public-content"],
                affinity: { "tag-a": 0.8 },
                lastDecayUtc: Date.now() - halfLifeDays * dayMs,
            });
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ "tag-b": 1 }));
            await service.flush();

            expect(written[0].affinity["tag-a"]).toBeCloseTo(0.4, 2);
        });

        it("caps the tag count, keeping the strongest", async () => {
            const affinity: Record<string, number> = {};
            for (let i = 0; i < 20; i++) affinity[`tag-${i}`] = 0.01 * (i + 1);
            const { db, written } = mockDb(
                {
                    _id: GLOBAL_AFFINITY_ID,
                    type: DocType.GlobalAffinity,
                    memberOf: ["group-public-content"],
                    affinity,
                },
                { maxTags: 5 },
            );
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ "tag-19": 1 }));
            await service.flush();

            expect(Object.keys(written[0].affinity)).toHaveLength(5);
            expect(written[0].affinity["tag-19"]).toBeDefined();
            expect(written[0].affinity["tag-0"]).toBeUndefined();
        });

        it("prunes scores below minScore", async () => {
            const { db, written } = mockDb(
                {
                    _id: GLOBAL_AFFINITY_ID,
                    type: DocType.GlobalAffinity,
                    memberOf: ["group-public-content"],
                    affinity: { tiny: 0.00001, real: 0.5 },
                },
                { minScore: 0.001 },
            );
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ real: 1 }));
            await service.flush();

            expect(written[0].affinity.tiny).toBeUndefined();
            expect(written[0].affinity.real).toBeDefined();
        });
    });

    describe("flush behaviour", () => {
        it("writes nothing when there is nothing buffered", async () => {
            const { db, written } = mockDb();
            const service = new GlobalAffinityService(db);

            await service.flush();

            expect(written).toHaveLength(0);
        });

        it("drops contributions when the singleton has not been seeded", async () => {
            const { db, written } = mockDb(null);
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ "tag-a": 1 }));
            await service.flush();

            expect(written).toHaveLength(0);
        });

        it("keeps a contribution that arrives mid-flush for the next batch", async () => {
            const { db, written } = mockDb();
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ "tag-a": 1 }));
            const inFlight = service.flush();
            // Lands after the buffer was taken but before the write resolves.
            service.contribute(vote({ "tag-b": 1 }));
            await inFlight;

            expect(written[0].affinity["tag-b"]).toBeUndefined();

            await service.flush();
            expect(written[1].affinity["tag-b"]).toBeGreaterThan(0);
        });

        it("restores the batch when the write fails, so nothing is lost", async () => {
            const { db, written } = mockDb();
            const error = jest.spyOn(console, "error").mockImplementation(() => {});
            db.upsertDoc.mockRejectedValueOnce(new Error("conflict"));
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ "tag-a": 1 }));
            await service.flush();
            expect(written).toHaveLength(0);

            await service.flush();
            expect(written).toHaveLength(1);
            expect(written[0].affinity["tag-a"]).toBeCloseTo(LEARNING_RATE, 10);
            expect(written[0].contributionCount).toBe(1);

            error.mockRestore();
        });

        it("honours a CMS-edited learning rate", async () => {
            const { db, written } = mockDb(undefined, { learningRate: 0.05 });
            const service = new GlobalAffinityService(db);

            service.contribute(vote({ "tag-a": 1 }));
            await service.flush();

            expect(written[0].affinity["tag-a"]).toBeCloseTo(0.05, 10);
        });
    });
});
