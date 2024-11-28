import { io, Socket } from "socket.io-client";
import { ref, watch } from "vue";
import { ApiDataResponseDto, ChangeReqAckDto, LocalChangeDto } from "../types";
import { accessMap, AccessMap } from "../permissions/permissions";
import { db } from "../db/database";
import { useLocalStorage } from "@vueuse/core";

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
    private localChanges = ref<LocalChangeDto[]>();
    private isCms: boolean;
    private processChangeReqLock: boolean = false;

    /**
     * Create a new socketio instance
     * @param apiUrl - Socket.io endpoint URL
     * @param cms - CMS mode flag
     * @param token - Access token
     */
    constructor(apiUrl: string, cms: boolean = false, token?: string) {
        this.isCms = cms;

        this.socket = io(apiUrl, token ? { auth: { token } } : undefined);

        this.socket.on("connect", () => {
            isConnected.value = true;
            this.requestData();
            this.processChangeReqLock = false; // reset process log on connection
        });

        this.socket.on("disconnect", () => {
            isConnected.value = false;
        });

        this.socket.on("data", async (data: ApiDataResponseDto) => {
            await db.bulkPut(data.docs);
            if (data.version != undefined) db.syncVersion = data.version;
        });

        this.socket.on("changeRequestAck", this.handleAck.bind(this));

        this.socket.on("clientConfig", (c: ClientConfig) => {
            if (c.accessMap) accessMap.value = c.accessMap;
            if (c.maxUploadFileSize) maxUploadFileSize.value = c.maxUploadFileSize;
        });

        // watch for local changes
        watch(
            [isConnected, this.localChanges],
            async () => {
                if (!this.localChanges.value) return;
                if (this.localChanges.value.length == 0) return;
                if (this.processChangeReqLock) return;
                if (!isConnected.value) return;

                this.pushLocalChange(this.localChanges.value[0]);
            },
            { immediate: true },
        );

        // update localChanges from DB
        setInterval(async () => {
            this.localChanges.value = await db.getLocalChanges();
        }, 500);
    }

    /**
     * Adds the listener function as an event listener for ev.
     * @param ev — Name of the event
     * @param listener — Callback function
     */
    public on(event: string, callback: (...args: any[]) => void) {
        // Expose socket events
        this.socket.on(event, callback);
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
    public async requestData() {
        // Request documents that are newer than the last received version
        this.socket.emit("clientDataReq", {
            version: await db.syncVersion,
            cms: this.isCms,
            accessMap: accessMap.value,
        });
    }

    /**
     * Push a single local change to the api
     */
    private async pushLocalChange(localChange: LocalChangeDto) {
        this.processChangeReqLock = true;
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
        this.localChanges.value = await db.getLocalChanges();

        // Push the next local change to api
        clearTimeout(this.retryTimeout);
        if (this.localChanges.value.length > 1) {
            this.pushLocalChange(this.localChanges.value[0]);
        } else {
            this.processChangeReqLock = false;
        }
    }
}

type socketConnectionOptions = {
    /**
     * Socket.io endpoint URL
     */
    apiUrl?: string;
    /**
     * CMS mode flag
     */
    cms?: boolean;
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
        if (!options.cms) options.cms = false;

        socket = new Socketio(options.apiUrl, options.cms, options.token);
    } else if (options?.reconnect) socket.reconnect();

    return socket;
}
