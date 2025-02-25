import { initConfig, SharedConfig, config } from "./config";
import { initDatabase } from "./db/database";
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
 * @param token - Authentication token
 */
export async function start(token?: string) {
    config.token = token;

    // Initialize the SocketIO connection (initialized on first call)
    getSocket();

    // Initialize the REST API connection (initialized on first call) and start syncing
    getRest().clientDataReq();
}
