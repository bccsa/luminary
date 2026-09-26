import { IsObject, IsOptional, IsNumber } from "class-validator";
import { Expose } from "class-transformer";
import { Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";

/**
 * Audience-wide affinity profile (singleton, fixed `_id` — see `GLOBAL_AFFINITY_ID` in
 * `util/globalAffinity.ts`). Mirrors `GlobalAffinityDto` in `shared/src/types/dto.ts`.
 *
 * `affinity` is server-owned. A client change request may only carry `contribution`, a
 * unit-L1 delta that `GlobalAffinityService` folds into the accumulator and discards —
 * `processGlobalAffinityDto` strips anything a client sent on `affinity` so it can never
 * reach the database. Writing takes `AclPermission.Contribute` on the doc's `memberOf`.
 */
export class GlobalAffinityDto extends _contentBaseDto {
    @IsObject()
    @IsOptional()
    @Expose()
    affinity: Record<Uuid, number>;

    @IsObject()
    @IsOptional()
    @Expose()
    contribution?: Record<Uuid, number>;

    @IsNumber()
    @IsOptional()
    @Expose()
    lastDecayUtc?: number;

    @IsNumber()
    @IsOptional()
    @Expose()
    contributionCount?: number;
}
