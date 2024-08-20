import { type SharedConfigT, config } from "./config";

import { getDatabase } from "./db/database";

export function createLuminary(pConfig: SharedConfigT) {
    //Create Database Instance and Return in a Object for the Client
    config.setConfig({ cms: pConfig.cms });
    const db = getDatabase(config.getCmsFlag());
    return { config, db };
}
