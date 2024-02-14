import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from "@nestjs/websockets";
import { Server } from "socket.io";
import { Injectable } from "@nestjs/common";
import { DbService } from "./db/db.service";
import * as nano from "nano";
import { DocType, AclPermission, AckStatus, Uuid } from "./enums";
import { Group } from "./permissions/permissions.service";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ChangeDto } from "./dto/ChangeDto";
import { ChangeReqAckDto } from "./dto/ChangeReqAckDto";
import { ChangeReqDto } from "./dto/ChangeReqDto";
import { ContentDto } from "./dto/ContentDto";
import { GroupAclEntryDto } from "./dto/GroupAclEntryDto";
import { GroupDto } from "./dto/GroupDto";
import { LanguageDto } from "./dto/LanguageDto";
import { PostDto } from "./dto/PostDto";
import { TagDto } from "./dto/TagDto";
import { UserDto } from "./dto/UserDto";

/**
 * DocType to DTO map
 */
const DocTypeMap = {
    change: ChangeDto,
    changeReq: ChangeReqDto,
    changeReqAck: ChangeReqAckDto,
    content: ContentDto,
    group: GroupDto,
    groupAclEntry: GroupAclEntryDto,
    language: LanguageDto,
    post: PostDto,
    tag: TagDto,
    user: UserDto,
};

@WebSocketGateway({
    cors: {
        origin: "*",
    },
})
@Injectable()
export class Socketio {
    @WebSocketServer()
    server: Server;

    constructor(private db: DbService) {}

    /**
     * Client data request event handler
     * @param reqData
     * @param socket
     */
    @SubscribeMessage("clientDataReq")
    onClientConnection(@MessageBody() reqData, @ConnectedSocket() socket: any) {
        // TODO: Get userId from JWT or determine if public user and link to configurable "public" user doc
        socket.data.user = "user-private";
        socket.data.groups = ["group-private-users"];

        // Determine document types to be queried from database
        const docTypes: Array<DocType> = [
            DocType.Post,
            DocType.Tag,
            DocType.Content,
            DocType.Language,
        ];
        if (reqData.cms) {
            docTypes.push(DocType.Group);
        }

        let from = 0;
        if (reqData.version && typeof reqData.version === "number") from = reqData.version;

        // Get user accessible groups
        const userAccess = Group.getAccess(socket.data.groups, docTypes, AclPermission.View);

        // Get data from database
        this.db
            .getDocs(socket.data.user, {
                groups: userAccess,
                types: docTypes,
                from: from,
            })
            .then((res: nano.MangoResponse<unknown>) => {
                if (res.docs) {
                    socket.emit("data", res.docs);
                }
            })
            .catch(console.error); // TODO: Add error logging provider
    }

    /**
     * Client data submission event handler
     * @param data
     * @param socket
     */
    @SubscribeMessage("data")
    async onClientData(@MessageBody() data: any, @ConnectedSocket() socket: any) {
        // TODO: Get userId from JWT or determine if public user and link to configurable "public" user doc
        socket.data.user = "editor-private";
        socket.data.groups = ["group-private-editors"];

        // Validate change request document
        const changeReq = plainToInstance(ChangeReqDto, data);
        const changeReqValidation = await validate(changeReq);
        if (changeReqValidation.length > 0) {
            let message = "Change request validation failed for the following constraints:\n";
            changeReqValidation.forEach((c) => {
                message += Object.values(c.constraints).join("\n") + "\n";
            });
            this.emitAck(socket, AckStatus.Rejected, data.reqId, message);
            return;
        }

        // Check included document existance and type validity
        if (!changeReq.doc.type || !Object.values(DocType).includes(changeReq.doc.type)) {
            this.emitAck(
                socket,
                AckStatus.Rejected,
                data.reqId,
                `Submitted "${changeReq.doc.type}" document validation failed:\nInvalid document type`,
            );
            return;
        }

        // Check included document validity
        const doc = plainToInstance(DocTypeMap[changeReq.doc.type], changeReq.doc);
        let message = `Submitted ${changeReq.doc.type} document validation failed for the following constraints:\n`;
        // Try-catch is needed to handle nested validation errors (speficially for arrays?) which throws an exception instead of giving a meaningful validation result.
        // TODO: Might be possible to work around the exception according to https://dev.to/avantar/validating-nested-objects-with-class-validator-in-nestjs-1gn8 (see comments) - but seems like they are just handling the error in any case.
        try {
            const docValidation = await validate(doc);
            if (docValidation.length > 0) {
                docValidation.forEach((c) => {
                    message += Object.values(c.constraints).join("\n") + "\n";
                });
                this.emitAck(socket, AckStatus.Rejected, data.reqId, message);
                return;
            }
        } catch (err) {
            message += err.message;
            this.emitAck(socket, AckStatus.Rejected, data.reqId, message);
            return;
        }

        // TODO: Permission check

        // Process update document
        this.db
            // Update in database
            .upsertDoc(data.doc)
            // Send acknowledgement to client
            .then(() => {
                this.emitAck(socket, AckStatus.Accepted, data.reqId);
            })
            .catch((err) => {
                this.emitAck(socket, AckStatus.Rejected, data.reqId, err.message);
            });
    }

    /**
     * Emit an acknowledgement to a Change Request
     * @param socket - Socket.io connected client instance
     * @param ack - Acknowleded status
     * @param message - Error message
     * @param reqId - ID of submitted change request
     */
    private emitAck(socket: any, ack: AckStatus, reqId?: Uuid, message?: string) {
        const _ack: ChangeReqAckDto = {
            reqId: reqId,
            type: DocType.ChangeReqAck,
            ack: ack,
        };

        if (message && _ack.ack == AckStatus.Rejected) {
            _ack.message = message;
        }

        if (!reqId) {
            _ack.ack = AckStatus.Rejected;
            _ack.message = "Invalid document ID. Unable to process change request.";
        }
        socket.emit("data", _ack);
    }
}
