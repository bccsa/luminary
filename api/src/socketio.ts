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
        socket.data.groups = ["group-private-content", "group-public-content"];

        // TODO: Move docTypes to function in db class with selection between cms vs non-cms
        const docTypes = ["post", "tag"];
        if (reqData.cms) {
            docTypes.push(...["group", "lang"]);
        }

        let from: number;
        if (reqData.updateVersion && typeof reqData.updateVersion === "number")
            from = reqData.updateVersion;

        // Test query to return some data to CMS
        this.db
            .getDocs(socket.data.user, {
                groups: socket.data.groups,
                types: docTypes,
                from: from,
            })
            .then((res: any) => {
                if (res.docs) {
                    socket.emit("data", res.docs);
                }
            })
            .catch(console.error); // TODO: Add error logging provider
    }
}
