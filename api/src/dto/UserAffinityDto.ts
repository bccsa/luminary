import { IsNumber, IsObject, IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { Uuid } from "../enums";
import { _baseDto } from "./_baseDto";

/**
 * Per-user private recommendation affinity profile.
 *
 * Owner-scoped, NOT group-scoped: delivered to its owner via
 * `authIdentity.resolveIdentity` → `clientConfig`, written only by its owner
 * (`validateChangeRequestAccess`), never synced through the group firehose
 * (excluded in `socketio.ts`) and never returned by `/query` (blocked in
 * `query.service.ts`). `_id` is `user-affinity-<userId>`; `memberOf` is
 * intentionally absent (belongs to no group). `ownerId` is server-stamped in
 * `processUserAffinityDto` — a client-supplied value is ignored.
 */
export class UserAffinityDto extends _baseDto {
    @IsOptional()
    @IsString()
    @Expose()
    ownerId?: Uuid;

    @IsObject()
    @Expose()
    affinity: Record<Uuid, number>;

    @IsOptional()
    @IsNumber()
    @Expose()
    lastDecayUtc?: number;
}
