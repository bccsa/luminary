import { initConfig, SharedConfig } from "./config";
import { initDatabase } from "./db/database";
import { HttpReq } from "./api/http";
import { getRest } from "./api/RestApi";
import { initSync } from "./api/sync/sync";
import { initLiveSync } from "./api/sync/liveSync";
import { getSocket } from "./socket/socketio";
import { initRoomSubscriptions } from "./socket/roomSubscriptions";
import { initHybridQuery } from "./util/HybridQuery";

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

    // Socket.io is a pure change-feed transport; the sync live persister owns the
    // decision of which live updates get written to IndexedDB (gated by isSyncableDoc,
    // derived from sync's syncList). Registered once — the socket re-fires listeners
    // across reconnects.
    initLiveSync();

    // Start re-joining still-wanted socket rooms on (re)connect. sync drives the
    // rooms for synced types; HybridQuery drives them on demand for non-synced types.
    initRoomSubscriptions();

    initHybridQuery(http);
}
