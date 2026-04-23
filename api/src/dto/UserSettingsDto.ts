import { Equals, IsBoolean, IsNumber, IsOptional } from "class-validator";
import { Expose } from "class-transformer";
import { _userDataBaseDto } from "./_userDataBaseDto";
import { DocType } from "../enums";

/**
 * Global per-user preferences. Singleton per user with deterministic id
 * `{userId}:settings`.
 */
export class UserSettingsDto extends _userDataBaseDto {
    @Equals(DocType.UserSettings)
    @Expose()
    public type: DocType.UserSettings;

    @IsOptional()
    @IsBoolean()
    @Expose()
    public privacyPolicyAccepted?: boolean;

    @IsOptional()
    @IsNumber()
    @Expose()
    public privacyPolicyAcceptedAt?: number;
}
