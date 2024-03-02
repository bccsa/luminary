import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayInit,
} from "@nestjs/websockets";
import { Injectable } from "@nestjs/common";
import { DbService } from "./db/db.service";
import * as nano from "nano";
import { DocType, AclPermission, AckStatus, Uuid } from "./enums";
import { PermissionSystem } from "./permissions/permissions.service";
import { ChangeReqAckDto } from "./dto/ChangeReqAckDto";
import { Socket } from "socket.io-client";
import { Server } from "socket.io";
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
export class Socketio implements OnGatewayInit {
    appDocTypes: Array<DocType> = [DocType.Post, DocType.Tag, DocType.Content, DocType.Language];
    cmsDocTypes: Array<DocType> = [DocType.Change, DocType.Group];

    constructor(private db: DbService) {}

    afterInit(server: Server) {
        // Subscribe to database changes and broadcast change to all group rooms to which the document belongs
        this.db.on("update", (update: any) => {
            // Only include documents with a document type property
            if (!update.type) {
                return;
            }

            // Broadcast CMS specific documents to CMS group rooms
            if (this.cmsDocTypes.includes(update.type)) {
                // Change documents referencing a non-group document
                if (update.memberOf) {
                    server.to(update.memberOf.map((g: Uuid) => "cms-" + g)).emit("data", [update]);
                    return;
                }

                // Group documents and Change documents referencing a group document
                if (
                    update.acl &&
                    (update.type == DocType.Group || update.docType == DocType.Group)
                ) {
                    server
                        .to(`cms-${update.docId ? update.docId : update._id}`)
                        .emit("data", [update]);
                    return;
                }

                return;
            }

            // All other valid documents - broadcast to App and CMS group rooms
            if (this.appDocTypes.includes(update.type)) {
                server
                    .to(update.memberOf.map((g) => "cms-" + g))
                    .to(update.memberOf.map((g) => "app-" + g))
                    .emit("data", [update]);

                return;
            }

            // TODO: Add error logging provider
        });
    }

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
        const groups = ["group-super-admins"];

        // Determine which doc types to get
        const docTypes = reqData.cms
            ? [...this.cmsDocTypes, ...this.appDocTypes]
            : this.appDocTypes;

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

        // Join user to group rooms
        for (const group of userAccess) {
            // @ts-expect-error Seems as if the Socket type definition does not include the join method
            socket.join(reqData.cms ? "cms-" + group : "app-" + group);
        }
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

        // Process change request
        await processChangeRequest(user, changeRequest, groups, this.db)
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
