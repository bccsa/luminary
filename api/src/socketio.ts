import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayInit,
} from "@nestjs/websockets";
import { Inject, Injectable } from "@nestjs/common";
import { DbService } from "./db/db.service";
import { AclPermission, DocType, PublishStatus } from "./enums";
import { PermissionSystem } from "./permissions/permissions.service";
import { isExpiredContent, stripExpiredContent } from "./util/stripExpiredContent";
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
 * Data request from client type definition.
 *
 * `cms` declares the connection's mode (CMS sends `true`, app/public `false`/omitted). The server
 * can't infer it from the AccessMap — that is per-user, and a CMS user holds both View and CmsView.
 * So the client must declare it: a CMS connection is routed to CmsView-scoped `${docType}-${group}-cms`
 * rooms (drafts/expired included, full fidelity); an app connection to base `${docType}-${group}`
 * rooms (published only; expired arrives stripped; drafts withheld). An absent flag → base rooms.
 */
type ClientDataReq = {
    docTypes: Array<any>;
    cms?: boolean;
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
    /** Connection mode, set from the `joinSocketGroups` handshake. true = CMS, false/undefined = app. */
    cms?: boolean;
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
            if (refGroups.length === 0) return;

            const now = Date.now();
            const version = update.updatedTimeUtc ? update.updatedTimeUtc : undefined;

            // DeleteCmd docs use a single shared room per group (no `-cms` split): both app (View) and
            // CMS (CmsView) connections join `deleteCmd-${group}`, and reason-based client handling
            // differentiates (e.g. DeleteReason.StatusChange deletes on the app only). Emit once.
            if (refDoc.type === DocType.DeleteCmd) {
                const rooms = refGroups.map((group) => `${refDoc.type}-${group}`);
                server.to(rooms).emit("data", { docs: [update], version });
                return;
            }

            // Two room sets per group: base `${type}-${group}` (app/View) and `${type}-${group}-cms`
            // (CMS/CmsView). CMS connections join only `-cms` rooms, so the base-room guarding below
            // can never corrupt a CMS client's full copy.
            const cmsRooms = refGroups.map((group) => `${refDoc.type}-${group}-cms`);
            const baseRooms = refGroups.map((group) => `${refDoc.type}-${group}`);

            // `-cms` rooms always receive the full doc, every status (published, draft, expired) —
            // this is what gives CMS clients live draft/expired collaboration.
            server.to(cmsRooms).emit("data", { docs: [update], version });

            // Base (app/View) rooms receive only what the app may hold:
            //  - draft/unpublished Content → withheld entirely (the app is evicted via the existing
            //    DeleteReason.StatusChange DeleteCmd, which is app-only).
            //  - expired Content → a stripped cleanup stub so the app's deleteExpired() prunes the
            //    stale copy without the body crossing the wire (preserves the #433 expiry edge case).
            //  - published-and-live Content + all non-Content docs → full, as before.
            if (update.type === DocType.Content && update.status !== PublishStatus.Published) {
                // draft/unpublished — withheld from app base rooms
            } else if (isExpiredContent(update, now)) {
                server.to(baseRooms).emit("data", { docs: [stripExpiredContent(update)], version });
            } else {
                server.to(baseRooms).emit("data", { docs: [update], version });
            }
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

        // Record the connection mode (CMS vs app) for this socket. All subsequent room joins
        // (here and via dynamic `joinRooms`) are routed by it. Absent/false → app (base rooms).
        socket.data.cms = reqData.cms === true;

        // Determine which doc types to get
        const docTypes: Array<any> = [];
        reqData.docTypes.forEach((docType) => {
            if (!docTypes.includes(docType.type)) docTypes.push(docType.type);
        });

        this.joinDocTypeRooms(socket, docTypes);
    }

    /**
     * Resolve the permission + room-name suffix for a socket's mode. CMS connections are scoped by
     * CmsView and join `${docType}-${group}-cms` rooms; app connections by View and join the base
     * `${docType}-${group}` rooms. Keeps the join/leave/room-name logic in one place.
     */
    private roomConfig(socket: ClientSocket): { permission: AclPermission; suffix: string } {
        return socket.data.cms
            ? { permission: AclPermission.CmsView, suffix: "-cms" }
            : { permission: AclPermission.View, suffix: "" };
    }

    /**
     * Dynamically subscribe a client to live updates for the given doc types. Used by
     * sync (for synced types) and HybridQuery (for non-synced types it queries) so the
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

        const { permission, suffix } = this.roomConfig(socket);
        const userGroups = PermissionSystem.accessMapToGroups(
            socket.data.userDetails.accessMap,
            permission,
            docTypes,
        );

        for (const docType of Object.keys(userGroups)) {
            for (const group of userGroups[docType]) {
                socket.leave(`${docType}-${group}${suffix}`);
            }
        }
    }

    /**
     * Join the client to the rooms its accessMap grants for each requested doc type, plus the
     * matching `deleteCmd-${group}` rooms. The room set depends on the connection mode (see
     * {@link roomConfig}): app connections join base `${docType}-${group}` rooms via View; CMS
     * connections join `${docType}-${group}-cms` rooms via CmsView. `deleteCmd-${group}` rooms are
     * shared (un-suffixed) by both modes. Shared by the connect handshake (`joinSocketGroups`) and
     * dynamic `joinRooms`.
     */
    private joinDocTypeRooms(socket: ClientSocket, docTypes: Array<DocType>) {
        if (!docTypes.length) return;

        const { permission, suffix } = this.roomConfig(socket);

        // Get user accessible groups for the connection's permission (View or CmsView)
        const userGroups = PermissionSystem.accessMapToGroups(
            socket.data.userDetails.accessMap,
            permission,
            docTypes,
        );

        // Join user to group rooms (base for app, `-cms` for CMS)
        for (const docType of Object.keys(userGroups)) {
            for (const group of userGroups[docType]) {
                socket.join(`${docType}-${group}${suffix}`);
            }
        }

        // Join deleted documents rooms (shared room per group, both modes)
        const userAccessibleGroups = [...new Set(Object.values(userGroups).flat())];
        for (const group of userAccessibleGroups) {
            socket.join(`${DocType.DeleteCmd}-${group}`);
        }
    }
}
