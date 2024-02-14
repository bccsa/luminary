import { DocType, Uuid, AckStatus } from "../enums";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

/**
 * API acknowledgement to client after client submission of an ChangeReqDto document.
 */
export class ChangeReqAckDto {
    @IsNotEmpty()
    @IsString()
    reqId: Uuid; // Uuid of submitted ChangeReqDto to be acknowledged

    @IsNotEmpty()
    @IsEnum(DocType)
    type: DocType;

    @IsNotEmpty()
    @IsEnum(AckStatus)
    ack: AckStatus;

    @IsString()
    @IsOptional()
    message?: string; // Reject reason if applicable
}
