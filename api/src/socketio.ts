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
import { JwtUserDetails, processJwt } from "./jwt/processJwt";
import { S3Service } from "./s3/s3.service";
import { S3AudioService } from "./s3-audio/s3Audio.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";

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
        private s3Audio: S3AudioService,
    ) {}

    afterInit(server: Server<ReceiveEvents, EmitEvents, InterServerEvents, SocketData>) {
        // Handle authentication
        server.use(async (socket, next) => {
            // Get automatically assigned group access
            const userDetails = await processJwt(socket.handshake.auth.token, this.db, this.logger);

            if (socket.handshake.auth.token && !userDetails.jwtPayload) {
                // Assume that the user's token is expired.
                // Prompt the user to re-authenticate when an invalid token is provided.
                socket.emit("apiAuthFailed");
                // Disconnect the client to prevent further communication.
                socket.disconnect(true);
                return;
            }

            socket.data.userDetails = userDetails;
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
            const refGroups = refDoc.type == "group" ? [refDoc._id] : refDoc.memberOf;

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
            accessMap: socket.data.userDetails.accessMap,
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
    }
}
