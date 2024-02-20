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
import { PermissionSystem } from "./permissions/permissions.service";
import { ChangeReqAckDto } from "./dto/ChangeReqAckDto";
import { validateChangeReq } from "./validation";
import { ValidationResult } from "./permissions/validateChangeReq";
import { Socket } from "socket.io-client";

type ClientDataReq = {
    version?: number;
    cms?: boolean;
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
    onClientConnection(@MessageBody() reqData: ClientDataReq, @ConnectedSocket() socket: Socket) {
        // TODO: Do type validation on reqData
        // TODO: Get userId from JWT or determine if public user and link to configurable "public" user doc
        const user = "user-private";
        const groups = ["group-private-users"];

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
        const userAccessMap = PermissionSystem.getAccessMap(groups);
        const userAccess = userAccessMap.calculateAccess(docTypes, AclPermission.View);

        // Get data from database
        this.db
            .getDocsPerGroup(user, {
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
    async onClientData(@MessageBody() data: any, @ConnectedSocket() socket: Socket) {
        // TODO: Get userId from JWT or determine if public user and link to configurable "public" user doc
        // const user = "super-admin";
        const groups = ["group-super-admins"];

        // Validate received data transfer object
        const message = await validateChangeReq(data);
        if (message) {
            this.emitAck(socket, AckStatus.Rejected, data.reqId, message);
            return;
        }

        // Get user accessible groups and validate change request
        const userAccessMap = PermissionSystem.getAccessMap(groups);
        const permissionCheck: ValidationResult = await PermissionSystem.validateChangeRequest(
            data,
            userAccessMap,
            this.db,
        );

        if (!permissionCheck.validated) {
            // If string not empty, permission check failed and return error message
            this.emitAck(socket, AckStatus.Rejected, data.reqId, permissionCheck.error);
            return;
        }

        // Process update document
        this.db
            // Update in database
            .upsertDoc(data.doc)
            // Send acknowledgement to client
            .then(() => {
                this.emitAck(socket, AckStatus.Accepted, data.reqId);
            })
            .catch((err) => {
                this.emitAck(socket, AckStatus.Rejected, data.reqId, err.message, data.doc._id);
            });
    }

    /**
     * Emit an acknowledgement to a Change Request
     * @param socket - Socket.io connected client instance
     * @param status - Acknowleded status
     * @param message - Error message
     * @param reqId - ID of submitted change request
     * @param docId - ID of the submitted document
     */
    private emitAck(
        socket: Socket,
        status: AckStatus,
        reqId?: Uuid,
        message?: string,
        docId?: Uuid,
    ) {
        const ack: ChangeReqAckDto = {
            reqId: reqId,
            type: DocType.ChangeReqAck,
            ack: status,
        };

        if (message && ack.ack == AckStatus.Rejected) {
            ack.message = message;
        }

        if (!reqId) {
            ack.ack = AckStatus.Rejected;
            ack.message = "Invalid document ID. Unable to process change request.";
        }

        if (docId) {
            this.db.getDoc(docId).then((doc) => {
                if (doc) {
                    ack.doc = doc;
                }
            });
        }

        socket.emit("data", ack);
    }
}
