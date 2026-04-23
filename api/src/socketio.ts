import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayInit,
} from "@nestjs/websockets";
import { Inject, Injectable } from "@nestjs/common";
import { DbService } from "./db/db.service";
import { AclPermission, DocType, USER_DATA_DOC_TYPES } from "./enums";
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
import { UserDbService } from "./userdata/userDb.service";

/**
 * Data request from client type definition
 */
type ClientDataReq = {
    docTypes: Array<any>;
};

/**
 * Client configuration type definition
 */
type ClientConfig = {
    maxUploadFileSize: number;
    maxMediaUploadFileSize?: number;
    userId?: string;
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
        private userDb: UserDbService,
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

        // User-data broadcast: partition-scoped to a single user. Only
        // that user's own sockets are ever in the target room, so the
        // broadcast fan-out is 1-3 devices regardless of cluster size.
        this.userDb.on("update", (update: any) => {
            if (!update?.type || !update?.userId) {
                this.logger.warn(
                    `Invalid user-data update (missing type or userId): ${update?._id}`,
                );
                return;
            }
            const room = `${update.type}-user-${update.userId}`;
            server.to(room).emit("data", {
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
        // Send client configuration data and access map. The userId is
        // included so the client can build partition-prefixed `_id`s for
        // user-data writes without having to resolve its own identity
        // from the JWT — the server already did that during auth.
        const clientConfig = {
            maxUploadFileSize: this.config.socketIo.maxHttpBufferSize,
            maxMediaUploadFileSize: this.config.socketIo.maxMediaUploadFileSize || 0,
            accessMap: socket.data.userDetails.accessMap,
            userId: socket.data.userDetails.userId,
        } as ClientConfig;
        socket.emit("clientConfig", clientConfig);

        // Determine which doc types to get
        const docTypes: Array<any> = [];
        reqData.docTypes.forEach((docType) => {
            if (!docTypes.includes(docType.type)) docTypes.push(docType.type);
        });

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

        // Join user-data rooms. Only authenticated, provisioned users
        // (those with a userId resolved by AuthIdentityService) get to
        // subscribe — anonymous sockets get nothing on these doc types.
        const userId = socket.data.userDetails?.userId;
        if (userId) {
            for (const docType of docTypes) {
                if (USER_DATA_DOC_TYPES.includes(docType)) {
                    socket.join(`${docType}-user-${userId}`);
                }
            }
        }
    }
}
