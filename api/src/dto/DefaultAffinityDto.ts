import { IsObject } from "class-validator";
import { Expose } from "class-transformer";
import { Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";

/**
 * CMS-editable global baseline affinity profile (singleton, fixed `_id` — see
 * `DEFAULT_AFFINITY_ID` in `util/userAffinity.ts`). Unlike `UserAffinityDto`
 * this IS a normal group-scoped/permissioned doc, edited by CMS admins via the
 * standard change-request path (`_contentBaseDto` requires `memberOf`). It is
 * cloned server-side into a first-time user's own UserAffinity scaffold at
 * login (cold start) — see `AuthIdentityService.getAffinity`.
 */
export class DefaultAffinityDto extends _contentBaseDto {
    @IsObject()
    @Expose()
    affinity: Record<Uuid, number>;
}
