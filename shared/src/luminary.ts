import { initConfig, SharedConfig } from "./config";
import { initDatabase } from "./db/database";
import { waitForAccessMap } from "./permissions/permissions";
import { getSocket } from "./socket/socketio";
import { getRest } from "./rest/RestApi";

export async function initLuminaryShared(config: SharedConfig) {
    initConfig(config);

    // Initialize the IndexedDB database
    await initDatabase();

    // Initialize the SocketIO connection (initialized on first call)
    getSocket();

    console.log("Waiting for access map");
    // Wait for the access map to be set through SocketIO
    await waitForAccessMap();
    console.log("Access map received");

    // Initialize the REST API connection (initialized on first call) and start syncing
    await getRest().clientDataReq();
}
