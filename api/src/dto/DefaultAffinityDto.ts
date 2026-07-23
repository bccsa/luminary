import { IsObject, IsOptional } from "class-validator";
import { Expose } from "class-transformer";
import { Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";

/**
 * CMS-editable affinity engine tuning knobs. Mirrors `AffinityConfig` in
 * `shared/src/recommendation/affinity.ts` — keep both in sync. Deep validation
 * (range clamping, defaulting missing fields) happens in
 * `processDefaultAffinityDto`, not via nested class-validator decorators, matching
 * this DTO's existing `affinity` map field.
 */
type Tier = "core" | "strong" | "established" | "unprotected";
export type AffinityConfigDto = {
    tierHalfLifeDays: Record<Tier, number>;
    tierWeight: Record<Tier, number>;
    hitWeight: number;
    minScore: number;
    maxTags: number;
    depthScale: number;
    readFloorPercent: number;
    eventWeight: {
        bookmark: number;
        bookmarkRemoved: number;
        completion: number;
        readCompletion: number;
        highlight: number;
        highlightRemoved: number;
        impression: number;
    };
};

/**
 * CMS-editable global baseline affinity profile (singleton, fixed `_id` — see
 * `DEFAULT_AFFINITY_ID` in `util/defaultAffinity.ts`). This is a normal
 * group-scoped/permissioned doc, edited by CMS admins via the standard
 * change-request path (`_contentBaseDto` requires `memberOf`). Its map is
 * delivered at login to seed a previously unused client-local profile — see
 * `AuthIdentityService.getDefaultAffinity`.
 *
 * `config`, if present, holds the CMS-editable affinity engine tuning knobs —
 * delivered at login the same way, via `AuthIdentityService.getAffinityConfig`.
 */
export class DefaultAffinityDto extends _contentBaseDto {
    @IsObject()
    @Expose()
    affinity: Record<Uuid, number>;

    @IsObject()
    @IsOptional()
    @Expose()
    config?: AffinityConfigDto;
}
