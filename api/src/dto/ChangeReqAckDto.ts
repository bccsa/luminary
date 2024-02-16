import { DocType, Uuid, AckStatus } from "../enums";

/**
 * API acknowledgement to client after client submission of an ChangeReqDto document.
 */
export class ChangeReqAckDto {
    reqId: Uuid; // Uuid of submitted ChangeReqDto to be acknowledged
    type: DocType;
    ack: AckStatus;
    message?: string; // Reject reason if applicable
    doc?: any; // The current database version if the change is rejected
}
