import { io, Socket } from "socket.io-client";
import { ref, watch } from "vue";
import { ApiDataResponseDto, ChangeReqAckDto, DocType, LocalChangeDto } from "../types";
import { db } from "../db/database";
import { useLocalStorage } from "@vueuse/core";
import { AccessMap, accessMap } from "../permissions/permissions";
import { config, SharedConfig } from "../config";

/**
 * Client configuration type definition
 */
type ClientConfig = {
    maxUploadFileSize: number;
    accessMap: AccessMap;
};

/**
 * Connection status as a Vue ref
 */
export const isConnected = ref(false);

/**
 * Maximum file size for uploads in bytes as a Vue ref
 */
export const maxUploadFileSize = useLocalStorage("maxUploadFileSize", 0);

class SocketIO {
    private socket: Socket;
    private retryTimeout: number = 0;
    private localChanges = ref<LocalChangeDto[]>();
    private processChangeReqLock: boolean = false;

    /**
     * Create a new SocketIO instance
     * @param {SharedConfig} config - Configuration object
     */
    constructor(config: SharedConfig) {
        const token = config.token;
        this.socket = io(config.apiUrl, token ? { auth: { token } } : undefined);

        this.socket.on("connect", () => {
            this.socket.emit("joinSocketGroups", { docTypes: config.syncList });
            this.processChangeReqLock = false; // reset process lock on connection
        });

        this.socket.on("disconnect", () => {
            isConnected.value = false;
        });

        this.socket.on("data", async (data: ApiDataResponseDto) => {
            // Filter out the data that is not in the requested docTypes array or language IDs array
            const filtered = data.docs.filter((doc) => {
                if (doc.type === DocType.DeleteCmd) return true; // Always include delete commands
                return config.syncList?.some((entry) => {
                    if (!entry.sync) return false; // Do not save documents to indexedDB that should not be synced
                    if (!entry.contentOnly && entry.type === doc.type) return true;
                    if (doc.type == DocType.Content && doc.parentType === entry.type) {
                        // Include content documents for all languages if no language filter is set
                        if (
                            !config.appLanguageIdsAsRef ||
                            !config.appLanguageIdsAsRef.value ||
                            !config.appLanguageIdsAsRef.value.length
                        )
                            return true;

                        // Filter content documents by language if a language filter is set
                        if (doc.language && config.appLanguageIdsAsRef.value.includes(doc.language))
                            return true;
                    }
                    return false;
                });
            });

            await db.bulkPut(filtered);
        });

        this.socket.on("changeRequestAck", this.handleAck.bind(this));

        this.socket.on("clientConfig", (c: ClientConfig) => {
            if (c.maxUploadFileSize) maxUploadFileSize.value = c.maxUploadFileSize;
            if (c.accessMap) accessMap.value = c.accessMap;
            isConnected.value = true; // Only set isConnected after configuration has been received from the API
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
     * @param event — Name of the event
     * @param callback — Callback function
     */
    public on(event: string, callback: (...args: any[]) => void) {
        // Expose socket events
        this.socket.on(event, callback);
    }

    /**
     * Removes the listener function as an event listener for ev.
     * @param event - Name of the event
     * @param callback - Callback function
     */
    public off(event: string, callback: (...args: any[]) => void) {
        // Expose socket events
        this.socket.off(event, callback);
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

let socket: SocketIO;

/**
 * Returns a singleton instance of the SocketIO client class.
 * @param options - Socket connection options
 */
export function getSocket(
    options: {
        /**
         * Force a reconnect to the server if the socket already exists
         */
        reconnect: boolean;
    } = { reconnect: false },
) {
    if (!socket) {
        if (!config) {
            throw new Error("Shared config object not initialized");
        }
        if (!config.apiUrl) {
            throw new Error("Socket connection requires an API URL");
        }

        socket = new SocketIO(config);
    } else if (options.reconnect) socket.reconnect();

    return socket;
}
