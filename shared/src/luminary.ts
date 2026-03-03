import { config, initConfig, SharedConfig } from "./config";
import { initDatabase } from "./db/database";
import { HttpReq } from "./rest/http";
import { getRest } from "./rest/RestApi";
import { initSync, updateSyncToken } from "./rest/sync2/sync";
import { getSocket, reconnectWithToken } from "./socket/socketio";

/**
 * Initialize the Luminary database
 * @param config
 */
export async function init(config: SharedConfig) {
    initConfig(config);

    // Initialize the IndexedDB database
    await initDatabase();

    // Initialize the SocketIO connection (initialized on first call)
    getSocket();

    // Initialize the REST API connection (initialized on first call) to start syncing
    // Currently still needed to push local changes to the API
    getRest();

    // Create HTTP service instance for use in sync operations
    const http = new HttpReq(config.apiUrl || "", config.token);
    initSync(http);
}

/**
 * Update the auth token on all connections (socket, REST, sync).
 * Used after authenticating to upgrade from guest to full access.
 */
export function updateAuthToken(token: string) {
    if (config) config.token = token;
    reconnectWithToken(token);
    updateSyncToken(token);
    getRest({ reset: true });
}

