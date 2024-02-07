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
import { AclPermission, DocType, Group } from "./permissions/permissions.service";

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

    @SubscribeMessage("clientDataReq")
    clientConnection(@MessageBody() reqData, @ConnectedSocket() socket: any) {
        // TODO: Get userId from JWT or determine if public user and link to configurable "public" user doc
        // TODO: Calculate expanded View group list to pass to db query. Store on socket / user object
        socket.data.user = "user-private";
        socket.data.groups = ["group-private-users"];

        // TODO: Move docTypes to function in db class with selection between cms vs non-cms
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
}
