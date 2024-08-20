import { io, Socket } from "socket.io-client";
import { ref, watch } from "vue";
import { ApiDataResponseDto, ChangeReqAckDto, LocalChangeDto } from "../types";
import { accessMap, AccessMap } from "../permissions/permissions";
import { getDatabase } from "../db/database";
import { useLocalStorage } from "@vueuse/core";
import { config } from "../config";

/**
 * Client configuration type definition
 */
type ClientConfig = {
    accessMap: AccessMap;
    maxUploadFileSize: number;
};

/**
 * Connection status as a Vue ref
 */
export const isConnected = ref(false);

/**
 * Maximum file size for uploads in bytes as a Vue ref
 */
export const maxUploadFileSize = useLocalStorage("maxUploadFileSize", 0);

class Socketio {
    private socket: Socket;
    private retryTimeout: number = 0;
    private isCms: boolean = config.getCmsFlag();
    private db = getDatabase(this.isCms);
    private localChanges = this.db.getLocalChangesAsRef();

    /**
     * Create a new socketio instance
     * @param apiUrl - Socket.io endpoint URL
     * @param cms - CMS mode flag
     * @param token - Access token
     */
    constructor(apiUrl: string, token?: string) {
        this.socket = io(apiUrl, token ? { auth: { token } } : undefined);
        this.socket.on("connect", () => {
            isConnected.value = true;
            this.requestData();
        });

        this.socket.on("disconnect", () => {
            isConnected.value = false;
        });

        this.socket.on("data", async (data: ApiDataResponseDto) => {
            await this.db.bulkPut(data.docs);
            if (data.version != undefined) this.db.syncVersion = data.version;
        });

        this.socket.on("changeRequestAck", this.handleAck.bind(this));

        this.socket.on("clientConfig", (c: ClientConfig) => {
            if (c.accessMap) accessMap.value = c.accessMap;
            if (c.maxUploadFileSize) maxUploadFileSize.value = c.maxUploadFileSize;
        });

        // watch for local changes
        watch(
            [isConnected, this.localChanges],
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
            { immediate: true },
        );
    }

    /**
     * Disconnect from the socket server
     */
    public disconnect() {
        this.socket.disconnect();
        // Force the connection status to false without waiting for the disconnect event
        isConnected.value = false;
    }

    /**
     * Disconnect and reconnect to the socket server
     */
    public reconnect() {
        this.socket.disconnect();
        isConnected.value = false;
        this.socket.connect();
    }

    /**
     * Send a clientDataReq message to the server. This is automatically called upon
     * connection to the server, but in some cases it may be necessary to request it manually
     * (e.g. after clearing local data).
     */
    public requestData() {
        // Request documents that are newer than the last received version
        this.socket.emit("clientDataReq", {
            version: this.db.syncVersion,
            cms: this.isCms,
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
        await this.db.applyLocalChangeAck(ack);

        // Push the next local change to api
        clearTimeout(this.retryTimeout);
        if (this.localChanges.value.length > 1) {
            this.pushLocalChange(this.localChanges.value[0]);
        }
    }
}

type socketConnectionOptions = {
    /**
     * Socket.io endpoint URL
     */
    apiUrl?: string;
    /**
     * Access token
     */
    token?: string;
    /**
     * Force a reconnect to the server if the socket already exists
     */
    reconnect?: boolean;
};

let socket: Socketio;

/**
 * Returns a singleton instance of the socketio client class. The api URL, token and CMS flag is only used when calling the function for the first time.
 * @param options - Socket connection options
 */
export function getSocket(options?: socketConnectionOptions) {
    if (!socket) {
        if (!options) {
            throw new Error("Socket connection requires options object");
        }
        if (!options.apiUrl) {
            throw new Error("Socket connection requires an API URL");
        }

        socket = new Socketio(options.apiUrl, options.token);
    } else if (options?.reconnect) socket.reconnect();

    return socket;
}
