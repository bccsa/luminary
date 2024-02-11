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
import { DocType, AclPermission, UpdateDto, AckDto, Ack } from "./dto";
import { Group } from "./permissions/permissions.service";

@WebSocketGateway({
    cors: {
        origin: "*",
    },
})
@Injectable()
export class Socketio {
    constructor(private db: DbService) {}

    @WebSocketServer()
    server: Server;

    /**
     * Client data request event handler
     * @param reqData
     * @param socket
     */
    @SubscribeMessage("clientDataReq")
    onClientConnection(@MessageBody() reqData, @ConnectedSocket() socket: any) {
        // TODO: Get userId from JWT or determine if public user and link to configurable "public" user doc
        socket.data.user = "user-private";
        socket.data.groups = ["group-private-users"];

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
        const userAccess = Group.getAccess(socket.data.groups, docTypes, AclPermission.View);

        // Get data from database
        this.db
            .getDocs(socket.data.user, {
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
    onClientData(@MessageBody() data: any, @ConnectedSocket() socket: any) {
        // TODO: Get userId from JWT or determine if public user and link to configurable "public" user doc
        socket.data.user = "editor-private";
        socket.data.groups = ["group-private-editors"];

        // UpdateDto type check
        if (data && data.type === "update" && (data as UpdateDto).type) {
            // TODO: Document type check

            // TODO: Permission check

            // Process update document
            this.db
                // Update in database
                .upsertDoc(data.doc)
                // Send acknowledgement to client
                .then(() => {
                    const ack: AckDto = {
                        _id: data._id, // Uuid of submitted UpdateDto to be acknowledged
                        type: DocType.Ack, // Should always be "ack"
                        ack: Ack.Accepted,
                        message: "",
                    };
                    socket.emit("data", ack);
                })
                .catch((err) => {
                    const ack: AckDto = {
                        _id: data._id, // Uuid of submitted UpdateDto to be acknowledged
                        type: DocType.Ack, // Should always be "ack"
                        ack: Ack.Rejected,
                        message: err.message,
                    };
                    socket.emit("data", ack);
                });
        }
    }
}
