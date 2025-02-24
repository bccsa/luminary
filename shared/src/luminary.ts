import { initConfig, SharedConfig, config } from "./config";
import { initDatabase } from "./db/database";
import { waitForAccessMap } from "./permissions/permissions";
import { getSocket } from "./socket/socketio";
import { getRest } from "./rest/RestApi";

/**
 * Initialize the Luminary database
 * @param config
 */
export async function init(config: SharedConfig) {
    initConfig(config);

    // Initialize the IndexedDB database
    await initDatabase();
}

/**
 * Start communication with the Luminary API
 * @param token
 */
export async function start(token?: string) {
    config.token = token;

    // Initialize the SocketIO connection (initialized on first call)
    getSocket();

    // Wait for the access map to be set through SocketIO
    await waitForAccessMap();

    // Initialize the REST API connection (initialized on first call) and start syncing
    getRest().clientDataReq();
}
