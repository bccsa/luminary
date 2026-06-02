import { initConfig, SharedConfig } from "./config";
import { initDatabase } from "./db/database";
import { HttpReq } from "./rest/http";
import { getRest } from "./rest/RestApi";
import { initSync } from "./rest/sync2/sync";
import { getSocket } from "./socket/socketio";
import { initHybridQuery } from "./util/hybridQuery";

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
    const http = new HttpReq(config.apiUrl || "");
    // MUST be awaited: initSync's body (db.getSyncList load → validation →
    // legacy publishDate resolve → findDegenerateChunkTypes reset) has to
    // complete before consumers register their {immediate:true} sync
    // watchers — otherwise the first sync() races the degenerate-state
    // reset and persists fresh entries that re-introduce the broken shape.
    await initSync(http);
    initHybridQuery(http);
}
