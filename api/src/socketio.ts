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
import { DocType, AclPermission, AckStatus } from "./enums";
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
    cmsDocTypes: Array<DocType> = [DocType.Group, DocType.Change];

    constructor(private db: DbService) {}

    afterInit(server: Server) {
        // Subscribe to database changes and broadcast change to all group rooms to which the document belongs
        this.db.on("update", async (update: any) => {
            // Only include documents with a document type property
            if (!update.type) {
                return; // TODO: Add error logging provider
            }

            // We are using a socket.io room per document type per group. Change documents are broadcasted to the document-group rooms of the documents they reference.
            // Content documents are broadcasted to their parent document-group rooms.
            let refDoc = update;

            // Extract reference document info from change documents
            if (refDoc.type == "change" && refDoc.changes) refDoc = update.changes;

            // Get parent document as reference document for content documents
            if (refDoc.type == "content") {
                const res = await this.db.getDoc(refDoc.parentId);
                if (!(res.docs && Array.isArray(res.docs) && res.docs.length > 0)) return; // TODO: Add error logging provider
                refDoc = res.docs[0];
            }

            // Get groups of reference document
            const refGroups = refDoc.type == "group" ? [refDoc._id] : refDoc.memberOf;

            // Create room names to emit to
            let rooms = refGroups.map((group) => `${refDoc.type}-${group}`);

            // Prepend "cms-" to the room names for (CMS only) change documents. This is needed to be able to allow the CMS to specifically subscribe to change documents.
            if (update.type == "change") rooms = rooms.map((room) => `cms-${room}`);

            // Emit to rooms
            if (rooms.length > 0) server.to(rooms).emit("data", [update]);
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
        const memberOfGroups = ["group-super-admins"];

        // Determine which doc types to get
        const docTypes = reqData.cms
            ? [...this.cmsDocTypes, ...this.appDocTypes]
            : this.appDocTypes;

        let from = 0;
        if (reqData.version && typeof reqData.version === "number") from = reqData.version;

        // Get user accessible groups
        const userAccess = PermissionSystem.getAccessibleGroups(
            docTypes,
            AclPermission.View,
            memberOfGroups,
        );

        // Get data from database
        this.db
            .getDocsPerGroup(user, {
                userAccess: userAccess,
                from: from,
            })
            .then((res: nano.MangoResponse<unknown>) => {
                if (res.docs) {
                    socket.emit("data", res.docs);
                }
            })
            .catch(console.error); // TODO: Add error logging provider

        // Join user to group rooms
        for (const docType of Object.keys(userAccess)) {
            for (const group of userAccess[docType]) {
                // @ts-expect-error Seems as if the Socket type definition does not include the join method
                socket.join(`${docType}-${group}`);

                // Subscribe to cms specific rooms
                if (reqData.cms) {
                    // @ts-expect-error Seems as if the Socket type definition does not include the join method
                    socket.join(`cms-${docType}-${group}`);
                }
            }
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
