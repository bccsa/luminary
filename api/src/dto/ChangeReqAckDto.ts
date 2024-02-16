import { DocType, Uuid, AckStatus } from "../enums";
import { _baseDto } from "./_baseDto";

/**
 * API acknowledgement to client after client submission of an ChangeReqDto document.
 */
export class ChangeReqAckDto {
    reqId: Uuid; // Uuid of submitted ChangeReqDto to be acknowledged
    type: DocType;
    ack: AckStatus;
    message?: string; // Reject reason if applicable
    doc?: _baseDto; // The current database version if the change is rejected
}
