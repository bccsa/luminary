import { initConfig, SharedConfig } from "./config";
import { initDatabase } from "./db/database";
import { waitForAccessMap } from "./permissions/permissions";
import { getSocket } from "./socket/socketio";
import { getRest } from "./rest/RestApi";

export async function initLuminaryShared(config: SharedConfig) {
    initConfig(config);

    // Initialize the IndexedDB database
    await initDatabase().catch((err) => {
        console.error(err);
        return Promise.reject(err);
    });

    // Initialize the SocketIO connection (initialized on first call)
    getSocket();

    // Wait for the access map to be set through SocketIO
    await waitForAccessMap();

    // Initialize the REST API connection (initialized on first call) and start syncing
    getRest().clientDataReq();
}
