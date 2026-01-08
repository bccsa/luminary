import { io, Socket } from "socket.io-client";
import { ref } from "vue";
import { ApiDataResponseDto, DocType } from "../types";
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

    /**
     * Create a new SocketIO instance
     * @param {SharedConfig} config - Configuration object
     */
    constructor(config: SharedConfig) {
        const token = config.token;
        this.socket = io(config.apiUrl, token ? { auth: { token } } : undefined);

        this.socket.on("connect", () => {
            this.socket.emit("joinSocketGroups", { docTypes: config.syncList });
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

        this.socket.on("clientConfig", (c: ClientConfig) => {
            if (c.maxUploadFileSize) maxUploadFileSize.value = c.maxUploadFileSize;
            if (c.accessMap) accessMap.value = c.accessMap;
            isConnected.value = true; // Only set isConnected after configuration has been received from the API
        });
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
