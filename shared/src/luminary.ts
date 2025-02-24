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
    console.log(Date.now().toString(), "initializing luminary shared config");
    initConfig(config);

    // Initialize the IndexedDB database
    console.log(Date.now().toString(), "initializing luminary-db database");
    await initDatabase();
}

/**
 * Start communication with the Luminary API
 * @param token
 */
export async function start(token?: string) {
    config.token = token;

    // Initialize the SocketIO connection (initialized on first call)
    console.log(Date.now().toString(), "initializing socket.io");
    getSocket();

    // Wait for the access map to be set through SocketIO
    console.log(Date.now().toString(), "waiting for access map");
    await waitForAccessMap();

    // Initialize the REST API connection (initialized on first call) and start syncing
    console.log(Date.now().toString(), "initializing sync");
    getRest().clientDataReq();
}
