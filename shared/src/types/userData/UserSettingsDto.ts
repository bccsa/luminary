import { DocType } from "../enum";
import type { UserDataBaseDto } from "./UserDataBaseDto";

/**
 * Global per-user preferences. Singleton per user — id: {userId}:settings.
 */
export type UserSettingsDto = UserDataBaseDto & {
    type: DocType.UserSettings;
    privacyPolicyAccepted?: boolean;
    privacyPolicyAcceptedAt?: number;
};
