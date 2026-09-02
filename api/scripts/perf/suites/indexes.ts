import * as fs from "fs";
import * as path from "path";
import { CatalogueEntry } from "../catalogue";
import { CouchClient, declaredIndexNames } from "../lib/couch";

export type IndexRow = {
    name: string;
    sourceFile: string;
    /** Present in the running CouchDB. */
    deployed: boolean;
    diskSize: number;
    /** View index sequence lag behind the database's update_seq. */
    seqLag: number;
    building: boolean;
    /** Referenced by the audit catalogue or by shared/ client code. */
    referenced: boolean;
};

export type IndexSuiteResult = {
    rows: IndexRow[];
    dbUpdateSeq: number;
    dbSizeBytes: number;
    /** Design docs live in CouchDB that have no JSON file backing them. */
    orphaned: string[];
};

/**
 * Inventory every declared index: whether it is deployed, how much disk it costs, how far
 * its view lags the database, and whether anything still asks for it. Each index is also a
 * write-time cost, so an unreferenced one is pure overhead on every document write.
 */
export async function runIndexSuite(
    couch: CouchClient,
    entries: CatalogueEntry[],
): Promise<IndexSuiteResult> {
    const declared = declaredIndexNames();
    const dbInfo = await couch.dbInfo();
    const dbUpdateSeq = parseInt(String(dbInfo.update_seq).split("-")[0], 10) || 0;

    const deployed = new Set((await couch.designDocIds()).map((id) => id.replace("_design/", "")));
    const referenced = referencedIndexNames(entries);

    const rows: IndexRow[] = [];
    for (const [name, sourceFile] of declared) {
        const info = deployed.has(name) ? await couch.designDocInfo(`_design/${name}`) : undefined;
        rows.push({
            name,
            sourceFile,
            deployed: deployed.has(name),
            diskSize: info?.diskSize ?? 0,
            seqLag: info ? Math.max(0, dbUpdateSeq - info.updateSeq) : 0,
            building: info?.updaterRunning ?? false,
            referenced: referenced.has(name),
        });
    }

    return {
        rows,
        dbUpdateSeq,
        dbSizeBytes: dbInfo.sizes?.file ?? 0,
        orphaned: [...deployed].filter((name) => !declared.has(name)),
    };
}

/**
 * An index counts as referenced if the audit catalogue pins it or any package's source names
 * it literally. Names assembled at runtime from parts (as `syncBatch` does) are invisible to a
 * literal scan, which is why the catalogue's own pins are folded in — it sends the real ones.
 */
function referencedIndexNames(entries: CatalogueEntry[]): Set<string> {
    const referenced = new Set<string>();
    for (const entry of entries) {
        if (entry.body?.use_index) referenced.add(entry.body.use_index);
    }

    const repo = path.resolve(__dirname, "../../../..");
    const sources: string[] = [];
    for (const pkg of ["api/src", "shared/src", "app/src", "cms/src"]) {
        const dir = path.join(repo, pkg);
        if (fs.existsSync(dir)) sources.push(...readSourceFiles(dir));
    }

    const haystack = sources.join("\n");
    for (const name of declaredIndexNames().keys()) {
        if (haystack.includes(name)) referenced.add(name);
    }
    return referenced;
}

function readSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === "dist") continue;
            readSourceFiles(full, acc);
        } else if (/\.(ts|vue|js)$/.test(entry.name)) {
            acc.push(fs.readFileSync(full, "utf8"));
        }
    }
    return acc;
}
