import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { GlobalAffinityDto } from "./GlobalAffinityDto";
import { DocType } from "../enums";
import { GLOBAL_AFFINITY_ID } from "../util/globalAffinity";

/**
 * Contract check on the exact payload the app sends. The app's own tests mock the REST layer,
 * so nothing there exercises these decorators — an earlier client sent `memberOf: []` and was
 * rejected by `_contentBaseDto`'s `@ArrayNotEmpty` before any of the access logic ran.
 */
describe("GlobalAffinityDto — client contribution payload", () => {
    const contribution = { "tag-a": 0.75, "tag-b": -0.25 };

    async function errorsFor(payload: Record<string, unknown>) {
        const instance = plainToInstance(GlobalAffinityDto, payload, {
            enableImplicitConversion: true,
        });
        const errors = await validate(instance, { whitelist: true });
        return errors.flatMap((e) => Object.keys(e.constraints ?? {}).map(() => e.property));
    }

    it("accepts what the app actually sends", async () => {
        expect(
            await errorsFor({
                _id: GLOBAL_AFFINITY_ID,
                type: DocType.GlobalAffinity,
                memberOf: ["group-super-admins", "group-public-content"],
                affinity: {},
                contribution,
            }),
        ).toEqual([]);
    });

    it("rejects an empty memberOf", async () => {
        expect(
            await errorsFor({
                _id: GLOBAL_AFFINITY_ID,
                type: DocType.GlobalAffinity,
                memberOf: [],
                affinity: {},
                contribution,
            }),
        ).toContain("memberOf");
    });

    it("accepts a payload carrying only a contribution", async () => {
        // `affinity` is server-owned and stripped in processing, so a client need not send it.
        expect(
            await errorsFor({
                _id: GLOBAL_AFFINITY_ID,
                type: DocType.GlobalAffinity,
                memberOf: ["group-public-content"],
                contribution,
            }),
        ).toEqual([]);
    });
});
