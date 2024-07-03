import { io, Socket } from "socket.io-client";
import { readonly, ref, watch } from "vue";
import { ApiDataResponseDto, ChangeReqAckDto, LocalChangeDto } from "../types";
import { setAccessMap, accessMap, AccessMap } from "../permissions/permissions";
import { db } from "../db/database";
import { config } from "../config/config";

/**
 * Client configuration type definition
 */
type ClientConfig = {
    accessMap: AccessMap;
    maxUploadFileSize: number;
};

export class Socketio {
    private socket: Socket;
    private retryTimeout: number = 0;
    private localChanges = db.getLocalChangesAsRef();

    private _isConnected = ref(false);
    /**
     * Socket.io connection status as a Vue readonly ref
     */
    public isConnected = readonly(this._isConnected);

    /**
     * Create a new socketio instance
     * @param token - Access token
     */
    constructor(token?: string) {
        this.socket = io(config.apiUrl, token ? { auth: { token } } : undefined);

        this.socket.on("connect", () => {
            this._isConnected.value = true;
            this.requestData();
        });

        this.socket.on("disconnect", () => {
            this._isConnected.value = false;
        });

        this.socket.on("data", async (data: ApiDataResponseDto) => {
            await db.bulkPut(data.docs);
            if (data.version) localStorage.setItem("syncVersion", data.version.toString());
        });

        this.socket.on("changeRequestAck", this.handleAck.bind(this));

        this.socket.on("clientConfig", (c: ClientConfig) => {
            if (c.accessMap) setAccessMap(c.accessMap);
            if (c.maxUploadFileSize) config.setMaxUploadFileSize(c.maxUploadFileSize);
        });

        // watch for local changes
        watch(
            [this.isConnected, this.localChanges],
            async ([isConnected, localChanges], [wasConnected]) => {
                if (!localChanges || localChanges.length == 0) {
                    return;
                }

                if (
                    (isConnected && !wasConnected && localChanges.length > 0) ||
                    (isConnected && localChanges.length == 1)
                ) {
                    this.pushLocalChange(localChanges[0]);
                }
            },
        );
    }

    /**
     * Disconnect and reconnect to the socket server
     * @param token - Access token
     */
    public reconnect(token?: string) {
        this.socket.disconnect();
        this._isConnected.value = false;
        this.socket.auth = { token };
        this.socket.connect();
    }

    /**
     * Send a clientDataReq message to the server. This is automatically called upon
     * connection to the server, but in some cases it may be necessary to request it manually
     * (e.g. after clearing local data).
     */
    public requestData() {
        // Request documents that are newer than the last received version
        const syncVersionString = localStorage.getItem("syncVersion");
        let syncVersion = 0;
        if (syncVersionString) syncVersion = Number.parseInt(syncVersionString);

        this.socket!.emit("clientDataReq", {
            version: syncVersion,
            cms: config.isCms,
            accessMap: accessMap.value,
        });
    }

    /**
     * Push a single local change to the api
     */
    private async pushLocalChange(localChange: LocalChangeDto) {
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
        }

        // Retry the submission after one minute if we haven't gotten an ack from the API
        this.retryTimeout = window.setTimeout(() => {
            this.pushLocalChange(localChange);
        }, 60000);

        this.socket.emit("changeRequest", localChange);
    }

    /**
     * Handle change request acknowledgements from the api
     */
    private async handleAck(ack: ChangeReqAckDto) {
        await db.applyLocalChangeAck(ack);

        // Push the next local change to api
        clearTimeout(this.retryTimeout);
        if (this.localChanges.value.length > 1) {
            this.pushLocalChange(this.localChanges.value[0]);
        }
    }
}
