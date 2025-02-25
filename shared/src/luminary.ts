import { initConfig, SharedConfig, config } from "./config";
import { initDatabase } from "./db/database";
import { getRest } from "./rest/RestApi";
import { getSocket } from "./socket/socketio";

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

    // Initialize the REST API connection (initialized on first call) to start syncing
    getRest();
}
