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
import { AuthIdentityService, ResolvedIdentity } from "./auth/auth-identity.service";
import { OAuthProviderDto } from "./dto/OAuthProviderDto";
import { S3Service } from "./s3/s3.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import * as jwtLib from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";

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

/** Guest identity used when no auth token is provided */
const GUEST_GROUP_ID = "group-public-users";

/**
 * Socket.io client socket.data type definition
 */
interface SocketData {
    identity: ResolvedIdentity;
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
        private identity: AuthIdentityService,
    ) {}

    afterInit(server: Server<ReceiveEvents, EmitEvents, InterServerEvents, SocketData>) {
        // Handle authentication
        server.use(async (socket, next) => {
            const token = socket.handshake.auth.token as string | undefined;

            // No token → guest access
            if (!token) {
                socket.data.identity = {
                    user: { _id: "guest", type: DocType.User, email: "", name: "Guest", memberOf: [] } as any,
                    groupIds: [GUEST_GROUP_ID],
                };
                return next();
            }

            try {
                // Decode without verification to extract the issuer domain (needed for JWKS URL)
                const decoded = jwtLib.decode(token) as jwtLib.JwtPayload | null;
                if (!decoded?.iss) throw new Error("Missing iss claim");

                // Prefer the explicit provider ID sent by the client over domain-based guessing.
                // This avoids ambiguity when multiple OAuthProvider documents share the same domain.
                const explicitProviderId = socket.handshake.auth.providerId as string | undefined;
                let provider: OAuthProviderDto | undefined;

                if (explicitProviderId) {
                    const res = await this.db.executeFindQuery({
                        selector: { _id: explicitProviderId, type: DocType.OAuthProvider },
                        limit: 1,
                    });
                    provider = res.docs?.[0] as OAuthProviderDto | undefined;
                }

                if (!provider) {
                    // Fall back to domain-based lookup
                    const domain = new URL(decoded.iss).hostname;
                    const res = await this.db.executeFindQuery({
                        selector: { type: DocType.OAuthProvider, domain },
                        limit: 1,
                    });
                    provider = res.docs?.[0] as OAuthProviderDto | undefined;
                }

                if (!provider) throw new Error(`No OAuthProvider found`);

                // Verify the token using the provider's JWKS
                const payload = await this.verifyToken(token, provider);

                // Resolve full identity
                socket.data.identity = await this.identity.resolveIdentity(payload, provider);
                next();
            } catch (err) {
                this.logger.error("Socket authentication failed", err);
                socket.emit("apiAuthFailed");
                socket.disconnect(true);
            }
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

    private verifyToken(token: string, provider: OAuthProviderDto): Promise<jwtLib.JwtPayload> {
        const jwksUri = `https://${provider.domain}/.well-known/jwks.json`;
        const client = new JwksClient({ jwksUri });

        const getKey: jwtLib.GetPublicKeyOrSecret = (header, callback) => {
            client.getSigningKey(header.kid, (err, key) => {
                if (err) return callback(err);
                callback(null, key.getPublicKey());
            });
        };

        const options: jwtLib.VerifyOptions = {};
        if (provider.audience) options.audience = provider.audience;

        return new Promise((resolve, reject) => {
            jwtLib.verify(token, getKey, options, (err, decoded) => {
                if (err) return reject(err);
                resolve(decoded as jwtLib.JwtPayload);
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
        // Compute access map from resolved group IDs
        const accessMap = PermissionSystem.getAccessMap(socket.data.identity.groupIds);

        // Send client configuration data and access map
        const clientConfig = {
            maxUploadFileSize: this.config.socketIo.maxHttpBufferSize,
            maxMediaUploadFileSize: this.config.socketIo.maxMediaUploadFileSize || 0,
            accessMap,
        } as ClientConfig;
        socket.emit("clientConfig", clientConfig);

        // Determine which doc types to get
        const docTypes: Array<any> = [];
        reqData.docTypes.forEach((docType) => {
            if (!docTypes.includes(docType.type)) docTypes.push(docType.type);
        });

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
            }
        }

        // Join deleted documents rooms
        const userAccessibleGroups = [...new Set(Object.values(userViewGroups).flat())];
        for (const group of userAccessibleGroups) {
            socket.join(`${DocType.DeleteCmd}-${group}`);
        }
    }
}
