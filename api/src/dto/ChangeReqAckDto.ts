import { AckStatus } from "../enums";
import { _baseDto } from "./_baseDto";
import { UserActivityDto } from "./UserActivityDto";
import { LegacyUserActivityDto } from "./LegacyUserActivityDto";

/**
 * API acknowledgement to client after client submission of an ChangeReqDto document.
 */
export class ChangeReqAckDto {
    ack: AckStatus;
    message?: string; // Reject reason if applicable
    warnings?: string[]; // Warnings about non-critical issues (e.g., image upload problems)
    info?: string[]; // Informational confirmations for non-critical positive side effects
    docs?: Array<_baseDto | UserActivityDto | LegacyUserActivityDto>; // Current stored versions when the change is rejected
}
