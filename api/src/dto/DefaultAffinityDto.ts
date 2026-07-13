import { IsObject } from "class-validator";
import { Expose } from "class-transformer";
import { Uuid } from "../enums";
import { _contentBaseDto } from "./_contentBaseDto";

/**
 * CMS-editable global baseline affinity profile (singleton, fixed `_id` — see
 * `DEFAULT_AFFINITY_ID` in `util/defaultAffinity.ts`). This is a normal
 * group-scoped/permissioned doc, edited by CMS admins via the standard
 * change-request path (`_contentBaseDto` requires `memberOf`). Its map is
 * delivered at login to seed a previously unused client-local profile — see
 * `AuthIdentityService.getDefaultAffinity`.
 */
export class DefaultAffinityDto extends _contentBaseDto {
    @IsObject()
    @Expose()
    affinity: Record<Uuid, number>;
}
