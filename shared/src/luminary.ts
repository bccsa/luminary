import { initConfig, SharedConfig } from "./config";
import { initDatabase } from "./db/database";
import { initMemStore } from "./db/memoryStore";

export async function initLuminaryShared(config: SharedConfig) {
    initConfig(config);
    initMemStore();
    await initDatabase(config);
}
