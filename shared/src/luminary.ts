import { initConfig, SharedConfig } from "./config";
import { initDatabase } from "./db/database";

export async function initLuminaryShared(config: SharedConfig, docsIndex: string = "") {
    initConfig(config);
    await initDatabase(docsIndex);
}
