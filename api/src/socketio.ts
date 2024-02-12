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
import { DocType, AclPermission, AckStatus, DocTypeMap } from "./types";
import { ChangeReqDto } from "./dto/ChangeReqDto";
import { ChangeReqAckDto } from "./dto/ChangeReqAckDto";
import { Group } from "./permissions/permissions.service";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

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
    async onClientData(@MessageBody() data: any, @ConnectedSocket() socket: any) {
        // TODO: Get userId from JWT or determine if public user and link to configurable "public" user doc
        socket.data.user = "editor-private";
        socket.data.groups = ["group-private-editors"];

        // Validate change request document
        const changeReq = plainToInstance(ChangeReqDto, data);
        const changeReqValidation = await validate(changeReq);
        if (changeReqValidation.length > 0) {
            return;
            // TODO: Return errors to client and add test
        }

        // Check included document existance and type validity
        if (!changeReq.doc.type || !Object.values(DocType).includes(changeReq.doc.type)) {
            return;
            // TODO: Return error to client and add test
        }

        // Check included document validity
        const doc = plainToInstance(DocTypeMap[changeReq.doc.type], changeReq.doc);
        const docValidation = await validate(doc);
        if (docValidation.length > 0) {
            return;
            // TODO: Return errors to client and add test
        }

        // TODO: Check sub-types (e.g. GroupAclEntryDto) where applicable

        // TODO: Permission check

        // Process update document
        this.db
            // Update in database
            .upsertDoc(data.doc)
            // Send acknowledgement to client
            .then(() => {
                const ack: ChangeReqAckDto = {
                    docId: data.docId, // Uuid of submitted ChangeReqDto to be acknowledged
                    type: DocType.ChangeReqAck, // Should always be "ack"
                    ack: AckStatus.Accepted,
                    message: "",
                };
                socket.emit("data", ack);
            })
            .catch((err) => {
                const ack: ChangeReqAckDto = {
                    docId: data.docId, // Uuid of submitted ChangeReqDto to be acknowledged
                    type: DocType.ChangeReqAck, // Should always be "ack"
                    ack: AckStatus.Rejected,
                    message: err.message,
                };
                socket.emit("data", ack);
            });
    }
}
