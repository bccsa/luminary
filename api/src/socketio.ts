import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayInit,
} from "@nestjs/websockets";
import { Inject, Injectable } from "@nestjs/common";
import { DbService } from "./db/db.service";
import { AclPermission, DocType } from "./enums";
import { PermissionSystem } from "./permissions/permissions.service";
import { ChangeReqAckDto } from "./dto/ChangeReqAckDto";
import { Socket, Server } from "socket.io";
import { ChangeReqDto } from "./dto/ChangeReqDto";
import { AccessMap } from "./permissions/permissions.service";
import configuration, { Configuration } from "./configuration";
import { JwtUserDetails } from "./auth/authIdentity.service";
import { S3Service } from "./s3/s3.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { AuthIdentityService } from "./auth/authIdentity.service";

/**
 * Data request from client type definition
 */
type ClientDataReq = {
    docTypes: Array<any>;
};

/**
 * Dynamic room (un)subscription request. Unlike `joinSocketGroups` (which carries
 * `ApiSyncQuery` objects), this carries a plain array of doc types — the server
 * expands each to the `${docType}-${group}` rooms the user's accessMap grants.
 */
type ClientRoomReq = {
    docTypes: Array<DocType>;
};

/**
 * Client configuration type definition
 */
type ClientConfig = {
    maxUploadFileSize: number;
    maxMediaUploadFileSize?: number;
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
    clientConfig: (e: ClientConfig) => void;
    apiAuthFailed: () => void;
};

/**
 * Socket.io received messages type definitions
 */
interface ReceiveEvents {
    clientDataReq: (a: ClientDataReq) => void;
    changeRequest: (b: ChangeReqDto) => void;
    joinRooms: (a: ClientRoomReq) => void;
    leaveRooms: (a: ClientRoomReq) => void;
}

/**
 * Placeholder
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface InterServerEvents {}

/**
 * Socket.io client socket.data type definition
 */
interface SocketData {
    userDetails: JwtUserDetails;
}

type ClientSocket = Socket<ReceiveEvents, EmitEvents, InterServerEvents, SocketData>;

@WebSocketGateway({
    cors: {
        origin: "*",
    },
    maxHttpBufferSize: configuration().socketIo.maxHttpBufferSize,
})
@Injectable()
export class Socketio implements OnGatewayInit {
    config: Configuration;

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private db: DbService,
        private s3: S3Service,
        private authIdentityService: AuthIdentityService,
    ) {}

    afterInit(server: Server<ReceiveEvents, EmitEvents, InterServerEvents, SocketData>) {
        // Handle authentication
        server.use(async (socket, next) => {
            const token = socket.handshake.auth?.token as string | undefined;
            const providerId = socket.handshake.auth?.providerId as string | undefined;

            // A token without a providerId is always inconsistent client state —
            // the provider doc was deleted, Dexie cache got partially cleared, or
            // a session predates the multi-provider header. Silently falling
            // through to guest would strand the user authenticated-in-Auth0-but-
            // anonymous-to-us with no UI feedback, so force the client through
            // the re-selection flow via the provider_not_found reason code.
            if (token && !providerId) {
                this.logger.warn("Socket handshake: token without providerId");
                const err: Error & { data?: Record<string, string> } = new Error("auth_failed");
                err.data = { type: "auth_failed", reason: "provider_not_found" };
                next(err);
                return;
            }

            try {
                const authIdentity = await this.authIdentityService.resolveOrDefault(
                    token,
                    providerId,
                );
                socket.data.userDetails = authIdentity.userDetails;
            } catch (error) {
                this.logger.warn("Socket auth failed for providerId=" + providerId, {
                    error: error instanceof Error ? error.message : error,
                });
                // Reject the connection properly via next(err).
                // The client receives this as a connect_error with err.message.
                // Pass through the coarse failure reason (set in AuthIdentityService.resolveOrDefault)
                // so the client can decide whether to evict its cached provider doc.
                const reason = (error as { reason?: string } | null | undefined)?.reason;
                const err: Error & { data?: Record<string, string> } = new Error("auth_failed");
                err.data = { type: "auth_failed", ...(reason ? { reason } : {}) };
                next(err);
                return;
            }
            next();
        });

        // Create config object with environmental variables
        this.config = configuration();

        // Subscribe to database changes and broadcast change to all group rooms to which the document belongs
        this.db.on("update", async (update: any) => {
            // Only include documents with a document type property
            if (!update.type) {
                this.logger.warn(
                    `Document type not found in database update object: ${update._id}`,
                );
                return;
            }

            // We are using a socket.io room per document type per group. Change documents are broadcasted to the document-group rooms of the documents they reference.
            // Content documents are broadcasted to their parent document-group rooms.
            let refDoc = update;

            // Extract reference document info from change documents
            if (refDoc.type == "change" && refDoc.changes) refDoc = update.changes;

            // Get parent document as reference document for content documents
            if (refDoc.type == "content") {
                const res = await this.db.getDoc(refDoc.parentId);
                if (!(res.docs && Array.isArray(res.docs) && res.docs.length > 0)) {
                    this.logger.warn(
                        `Parent document not found for content document: ${refDoc._id}`,
                    );
                    return;
                }
                refDoc = res.docs[0];
            }

            // Get groups of reference document
            const refGroups = refDoc.type == "group" ? [refDoc._id] : refDoc.memberOf || [];

            // Create room names to emit to
            const rooms = refGroups.map((group) => `${refDoc.type}-${group}`);

            // Emit to rooms
            if (rooms.length > 0)
                server.to(rooms).emit("data", {
                    docs: [update],
                    version: update.updatedTimeUtc ? update.updatedTimeUtc : undefined,
                });
        });
    }

    /**
     *  Join client to socket groups, to receive live updates
     * @param reqData
     * @param socket
     */
    @SubscribeMessage("joinSocketGroups")
    clientConfigReq(
        @MessageBody() reqData: ClientDataReq,
        @ConnectedSocket() socket: ClientSocket,
    ) {
        // Send client configuration data and access map
        const clientConfig = {
            maxUploadFileSize: this.config.socketIo.maxHttpBufferSize,
            maxMediaUploadFileSize: this.config.socketIo.maxMediaUploadFileSize || 0,
            accessMap: socket.data.userDetails.accessMap,
        } as ClientConfig;
        socket.emit("clientConfig", clientConfig);

        // Determine which doc types to get
        const docTypes: Array<any> = [];
        reqData.docTypes.forEach((docType) => {
            if (!docTypes.includes(docType.type)) docTypes.push(docType.type);
        });

        this.joinDocTypeRooms(socket, docTypes);
    }

    /**
     * Dynamically subscribe a client to live updates for the given doc types. Used by
     * sync2 (for synced types) and HybridQuery (for non-synced types it queries) so the
     * client only receives the change feed it currently needs. Additive to
     * `joinSocketGroups` — the connect handshake still owns the `clientConfig` reply.
     * @param reqData
     * @param socket
     */
    @SubscribeMessage("joinRooms")
    joinRooms(@MessageBody() reqData: ClientRoomReq, @ConnectedSocket() socket: ClientSocket) {
        this.joinDocTypeRooms(socket, reqData?.docTypes ?? []);
    }

    /**
     * Unsubscribe a client from a doc type's rooms (e.g. when the last live query for a
     * non-synced type disposes). `deleteCmd-${group}` rooms are intentionally NOT left —
     * other still-subscribed doc types share them; they are dropped on disconnect.
     * @param reqData
     * @param socket
     */
    @SubscribeMessage("leaveRooms")
    leaveRooms(@MessageBody() reqData: ClientRoomReq, @ConnectedSocket() socket: ClientSocket) {
        const docTypes = reqData?.docTypes ?? [];
        if (!docTypes.length) return;

        const userViewGroups = PermissionSystem.accessMapToGroups(
            socket.data.userDetails.accessMap,
            AclPermission.View,
            docTypes,
        );

        for (const docType of Object.keys(userViewGroups)) {
            for (const group of userViewGroups[docType]) {
                socket.leave(`${docType}-${group}`);
            }
        }
    }

    /**
     * Join the client to the `${docType}-${group}` rooms its accessMap grants View on for
     * each requested doc type, plus the matching `deleteCmd-${group}` rooms. Shared by the
     * connect handshake (`joinSocketGroups`) and dynamic `joinRooms`.
     */
    private joinDocTypeRooms(socket: ClientSocket, docTypes: Array<DocType>) {
        if (!docTypes.length) return;

        // Get user accessible groups
        const userViewGroups = PermissionSystem.accessMapToGroups(
            socket.data.userDetails.accessMap,
            AclPermission.View,
            docTypes,
        );

        // Join user to group rooms
        for (const docType of Object.keys(userViewGroups)) {
            for (const group of userViewGroups[docType]) {
                socket.join(`${docType}-${group}`);
            }
        }

        // Join deleted documents rooms
        const userAccessibleGroups = [...new Set(Object.values(userViewGroups).flat())];
        for (const group of userAccessibleGroups) {
            socket.join(`${DocType.DeleteCmd}-${group}`);
        }
    }
}
