import { DbService } from "./db.service";
import * as fs from "fs";
import * as path from "path";

let db;

/**
 * Function to insert or update database documents from a directory with JSON formatted documents
 * @param {string} directory - relative path to directory
 */
function upsertFromDir(directory: string): Promise<any> {
    // Read directory.
    // Note: Custom assets must be declared in nest-cli.json for inclusion in the build output (dist directory)
    const p = path.join(__dirname, directory);
    const dir = fs.readdirSync(p);
    const pList: Array<Promise<any>> = [];

    dir.forEach((file) => {
        // Read file fom disk
        const doc = JSON.parse(fs.readFileSync(path.join(p, file)).toString());

        // Update / insert in DB
        pList.push(db.upsertDoc(doc));
    });

    return Promise.all(pList);
}

/**
 * Insert or update design documents
 */
export function upsertDesignDocs(dbService: DbService): Promise<any> {
    if (!db) {
        db = dbService;
    }

    return upsertFromDir("designDocs");
}

/**
 * Insert or update database seeding documents (for unit testing or initial application installation)
 */
export function upsertSeedingDocs(dbService: DbService): Promise<any> {
    if (!db) {
        db = dbService;
    }

    return upsertFromDir("seedingDocs");
}

export function destroyAllDocs() {
    return db.destroyAllDocs();
}
