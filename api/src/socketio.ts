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
import { DocType, AclPermission, AckStatus } from "./enums";
import { PermissionSystem } from "./permissions/permissions.service";
import { ChangeReqAckDto } from "./dto/ChangeReqAckDto";
import { Socket } from "socket.io-client";
import { ChangeReqDto } from "./dto/ChangeReqDto";
import { processChangeRequest } from "./changeRequests/processChangeRequest";

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
     * @param changeRequests An array of change requests
     * @param socket
     */
    @SubscribeMessage("changeRequest")
    async onChangeRequest(@MessageBody() changeRequest: any, @ConnectedSocket() socket: Socket) {
        // TODO: Get userId from JWT or determine if public user and link to configurable "public" user doc
        const user = "super-admin";
        const groups = ["group-super-admins"];

        // Get user accessible groups and validate change request
        const userAccessMap = PermissionSystem.getAccessMap(groups);

        // Process change request
        await processChangeRequest(user, changeRequest, userAccessMap, this.db)
            .then(() => {
                this.emitAck(socket, AckStatus.Accepted, changeRequest);
            })
            .catch((err) => {
                this.emitAck(socket, AckStatus.Rejected, changeRequest, err.message);
            });
    }

    /**
     * Emit an acknowledgement to a Change Request
     * @param socket - Socket.io connected client instance
     * @param status - Acknowleded status
     * @param changeRequest - Change request object
     * @param message - Error message
     */
    private async emitAck(
        socket: Socket,
        status: AckStatus,
        changeRequest: ChangeReqDto,
        message?: string,
    ) {
        const ack: ChangeReqAckDto = {
            id: changeRequest.id,
            ack: status,
        };

        if (message && status == AckStatus.Rejected) {
            ack.message = message;
        }

        if (changeRequest.doc && status == AckStatus.Rejected) {
            await this.db.getDoc(changeRequest.doc._id).then((res) => {
                if (res.docs.length > 0) {
                    ack.doc = res.docs[0];
                }
            });
        }

        socket.emit("changeRequestAck", ack);
    }
}
