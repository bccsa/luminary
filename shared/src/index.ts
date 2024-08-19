import { type SharedConfigT, config } from "./config";
import { database } from "./db/database";

export * from "./types";
export * from "./permissions/permissions";
export * from "./socket/socketio";
export * from "./util";

export let db: database;

export function createLuminary(pConfig: SharedConfigT) {
    //Create Database Instance and Return in a Object for the Client
    config.setConfig({ cms: pConfig.cms });
    db = new database(config.getCmsFlag());
    return { config, db };
}
