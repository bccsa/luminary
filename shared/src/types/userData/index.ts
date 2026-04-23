import type { UserContentDto } from "./UserContentDto";
import type { UserSettingsDto } from "./UserSettingsDto";

export * from "./UserDataBaseDto";
export * from "./HighlightEntry";
export * from "./UserContentDto";
export * from "./UserSettingsDto";
export * from "./userDataIds";

/**
 * Discriminated union of every user-data doc shape. Useful at the
 * transport boundary where a single payload can carry either type.
 */
export type UserDataDto = UserContentDto | UserSettingsDto;
