import { initConfig, SharedConfig } from "./config";
import { initDatabase } from "./db/database";

export function initLuminaryShared(config: SharedConfig) {
    initConfig(config);
    initDatabase();
}
