import { DbService } from "./db.service";
import * as fs from "fs";
import * as path from "path";
import { CONTENT_DESIGN_DOCS_DIR, CONTENT_SEED_DOCS_DIR } from "./databaseAssets";

/** Load only the explicit database directory; do not recurse into other sources. */
function upsertFromDir(db: DbService, directory: string): Promise<any[]> {
    const files = fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((file) => file.isFile() && file.name.endsWith(".json"));
    return Promise.all(
        files.map((file) => {
            const doc = JSON.parse(fs.readFileSync(path.join(directory, file.name), "utf8"));
            return db.upsertDoc(doc);
        }),
    );
}

/** Install only the shared/content database's design documents. */
export function upsertDesignDocs(db: DbService): Promise<any[]> {
    return upsertFromDir(db, CONTENT_DESIGN_DOCS_DIR);
}

/** Seed only shared/content documents; owner activity has no shared seed data. */
export function upsertSeedingDocs(db: DbService): Promise<any[]> {
    return upsertFromDir(db, CONTENT_SEED_DOCS_DIR);
}
