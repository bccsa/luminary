import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayInit,
} from "@nestjs/websockets";
import { Injectable } from "@nestjs/common";
import { DbQueryResult, DbService } from "./db/db.service";
import { DocType, AclPermission, AckStatus, Uuid } from "./enums";
import { PermissionSystem } from "./permissions/permissions.service";
import { ChangeReqAckDto } from "./dto/ChangeReqAckDto";
import { Socket, Server } from "socket.io";
import { ChangeReqDto } from "./dto/ChangeReqDto";
import { processChangeRequest } from "./changeRequests/processChangeRequest";
import { AccessMap } from "./permissions/permissions.service";
import * as JWT from "jsonwebtoken";
import configuration, { Configuration } from "./configuration";
import { PermissionMap, getJwtPermission, parsePermissionMap } from "./jwt/jwtPermissionMap";

/**
 * Data request from client type definition
 */
type ClientDataReq = {
    version?: number;
    cms?: boolean;
    accessMap?: AccessMap;
};

/**
 * Data response to client type definition
 */
type ApiDataResponse = {
    docs: Array<any>;
    version?: number;
};

/**
 * Socket.io emitted messages type definitions
 */
type EmitEvents = {
    data: (a: ApiDataResponse) => void;
    changeRequestAck: (b: ChangeReqAckDto) => void;
    accessMap: (c: AccessMap) => void;
    version: (d: number) => void;
};

/**
 * Socket.io received messages type definitions
 */
interface ReceiveEvents {
    clientDataReq: (a: ClientDataReq) => void;
    changeRequest: (b: ChangeReqDto) => void;
}

/**
 * Placeholder
 */
interface InterServerEvents {}

/**
 * Socket.io client socket.data type definition
 */
interface SocketData {
    userId: Uuid;
    memberOf: Array<Uuid>;
}

type ClientSocket = Socket<ReceiveEvents, EmitEvents, InterServerEvents, SocketData>;

@WebSocketGateway({
    cors: {
        origin: "*",
    },
})
@Injectable()
export class Socketio implements OnGatewayInit {
    appDocTypes: Array<DocType> = [DocType.Post, DocType.Tag, DocType.Content, DocType.Language];
    cmsDocTypes: Array<DocType> = [DocType.Group, DocType.Change];
    permissionMap: PermissionMap;
    config: Configuration;

    constructor(private db: DbService) {}

    afterInit(server: Server<ReceiveEvents, EmitEvents, InterServerEvents, SocketData>) {
        server.on("connection", (socket) => this.connection(socket));

        // Create config object with environmental variables
        this.config = configuration();

        // Parse permission map
        this.permissionMap = parsePermissionMap(this.config.permissionMap);

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
            if (rooms.length > 0)
                server.to(rooms).emit("data", {
                    docs: [update],
                    version: update.updatedTimeUtc ? update.updatedTimeUtc : undefined,
                });
        });
    }

    /**
     * Connection event handler
     * @param socket
     */
    connection(socket: ClientSocket) {
        let jwt: string | JWT.JwtPayload;
        try {
            jwt = JWT.verify(socket.handshake.auth.token, this.config.auth.jwtSecret, {
                algorithms: ["HS256"],
            });
        } catch (err) {
            console.log(err.message); //TMP
        }

        if (!jwt && socket.handshake.auth && socket.handshake.auth.token) {
            // Assume that the user's token is expired.
            // Prompt the user to re-authenticate instead of assigning public access to the user
            return;
        }

        if (!jwt) console.log("JWT not verified"); //TMP

        // Get group access
        const permissions = getJwtPermission(jwt, this.permissionMap);
        socket.data.memberOf = permissions.groups;

        console.log(permissions.groups); //TMP

        // Get user ID
        if (permissions.userId) {
            // Public or JWT assigned user ID.
            socket.data.userId = permissions.userId;
            return;
        }

        // TODO: Get or create user ID in database
    }

    /**
     * Client data request event handler
     * @param reqData
     * @param socket
     */
    @SubscribeMessage("clientDataReq")
    clientDataReq(@MessageBody() reqData: ClientDataReq, @ConnectedSocket() socket: ClientSocket) {
        // TODO: Do type validation on reqData

        // Get access map and send to client
        const accessMap = PermissionSystem.getAccessMap(socket.data.memberOf);
        socket.emit("accessMap", accessMap);

        // Determine which doc types to get
        const docTypes = reqData.cms
            ? [...this.cmsDocTypes, ...this.appDocTypes]
            : this.appDocTypes;

        let from = 0;
        if (reqData.version && typeof reqData.version === "number") from = reqData.version;

        // Get user accessible groups
        const userViewGroups = PermissionSystem.accessMapToGroups(
            accessMap,
            AclPermission.View,
            docTypes,
        );

        // Join user to group rooms
        for (const docType of Object.keys(userViewGroups)) {
            for (const group of userViewGroups[docType]) {
                socket.join(`${docType}-${group}`);

                // Subscribe to cms specific rooms
                if (reqData.cms) {
                    socket.join(`cms-${docType}-${group}`);
                }
            }
        }

        // Get updated data from database
        this.db
            .getDocsPerGroup(socket.data.userId, {
                userAccess: userViewGroups,
                from: from,
            })
            .then((res: DbQueryResult) => {
                if (res.docs) {
                    const response: ApiDataResponse = { docs: res.docs };
                    if (res.version) response.version = res.version;

                    socket.emit("data", response);
                }
            })
            .catch(console.error); // TODO: Add error logging provider

        // Get diff between user submitted access map and actual access
        const diff = PermissionSystem.accessMapDiff(accessMap, reqData.accessMap);
        const newAccessibleGroups = PermissionSystem.accessMapToGroups(
            diff,
            AclPermission.View,
            docTypes,
        );

        // Get historical data from database for newly accessible groups
        if (newAccessibleGroups.size > 0) {
            this.db
                .getDocsPerGroup(socket.data.userId, {
                    userAccess: newAccessibleGroups,
                    to: from,
                })
                .then((res: DbQueryResult) => {
                    if (res.docs) {
                        socket.emit("data", { docs: res.docs });
                    }
                })
                .catch(console.error); // TODO: Add error logging provider
        }
    }

    /**
     * Client data submission event handler
     * @param changeRequests An array of change requests
     * @param socket
     */
    @SubscribeMessage("changeRequest")
    async changeRequest(
        @MessageBody() changeRequest: ChangeReqDto,
        @ConnectedSocket() socket: ClientSocket,
    ) {
        // Process change request
        await processChangeRequest(socket.data.userId, changeRequest, socket.data.memberOf, this.db)
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
