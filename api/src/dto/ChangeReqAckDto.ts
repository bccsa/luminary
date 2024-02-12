import { DocType, Uuid, AckStatus } from "../types";
import { IsNotEmpty, IsString } from "class-validator";

/**
 * API acknowledgement to client after client submission of an ChangeReqDto document.
 */
export class ChangeReqAckDto {
    @IsNotEmpty()
    docId: Uuid; // Uuid of submitted ChangeReqDto to be acknowledged
    @IsNotEmpty()
    type: DocType.ChangeReqAck;
    @IsNotEmpty()
    ack: AckStatus;
    @IsString()
    message: string; // Reject reason if applicable
}
