import { DocType, Uuid, AckStatus } from "../enums";
import { Equals, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

/**
 * API acknowledgement to client after client submission of an ChangeReqDto document.
 */
export class ChangeReqAckDto {
    @IsNotEmpty()
    @IsString()
    reqId: Uuid; // Uuid of submitted ChangeReqDto to be acknowledged

    @IsNotEmpty()
    @Equals("changeReqAck")
    type: DocType.ChangeReqAck;

    @IsNotEmpty()
    @IsEnum(AckStatus)
    ack: AckStatus;

    @IsString()
    @IsOptional()
    message?: string; // Reject reason if applicable
}
