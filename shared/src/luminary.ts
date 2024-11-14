import { initConfig, SharedConfig } from "./config";
import { initDatabase } from "./db/database";

export async function initLuminaryShared(config: SharedConfig) {
    initConfig(config);
    await initDatabase(config);
}
