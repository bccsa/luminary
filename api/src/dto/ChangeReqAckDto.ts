import { AckStatus } from "../enums";
import { _baseDto } from "./_baseDto";

/**
 * API acknowledgement to client after client submission of an ChangeReqDto document.
 */
export class ChangeReqAckDto {
    id: number; // Id of submitted ChangeReqDto to be acknowledged
    ack: AckStatus;
    message?: string; // Reject reason if applicable
    warnings?: string[]; // Warnings about non-critical issues (e.g., image upload problems)
    docs?: _baseDto[]; // The current database version of the document(s) if the change has been rejected
}
