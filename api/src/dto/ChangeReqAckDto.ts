import { AckStatus } from "../enums";

/**
 * API acknowledgement to client after client submission of an ChangeReqDto document.
 */
export class ChangeReqAckDto {
    id: number; // Id of submitted ChangeReqDto to be acknowledged
    ack: AckStatus;
    message?: string; // Reject reason if applicable
    doc?: any; // The current database version if the change is rejected
}
