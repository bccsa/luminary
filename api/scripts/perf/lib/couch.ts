import * as fs from "fs";
import * as path from "path";
import { PerfConfig } from "./config";

export type ExplainResult = {
    index?: { ddoc?: string | null; name?: string; type?: string };
    mrargs?: Record<string, unknown>;
    selector?: unknown;
    limit?: number;
};

export type DesignDocInfo = {
    name: string;
    /** Bytes the view index occupies on disk. */
    diskSize: number;
    /** Sequence the view has indexed up to; lagging the DB's update_seq means stale reads or a build in progress. */
    updateSeq: number;
    updaterRunning: boolean;
};

/** Direct CouchDB access, used for what the HTTP API can't tell us: query plans and index state. */
export class CouchClient {
    private readonly base: string;
    private readonly authHeader?: string;

    constructor(private readonly config: PerfConfig) {
        // fetch() rejects a URL carrying credentials, and DB_CONNECTION_STRING normally
        // carries them, so move them into a Basic auth header.
        const url = new URL(config.couchUrl);
        if (url.username || url.password) {
            const credentials = `${decodeURIComponent(url.username)}:${decodeURIComponent(
                url.password,
            )}`;
            this.authHeader = `Basic ${Buffer.from(credentials).toString("base64")}`;
            url.username = "";
            url.password = "";
        }
        this.base = `${url.toString().replace(/\/+$/, "")}/${encodeURIComponent(config.couchDb)}`;
    }

    async dbInfo(): Promise<any> {
        return this.json(this.base);
    }

    /** Ask CouchDB which index it would choose for a query, without running it. */
    async explain(query: unknown): Promise<ExplainResult> {
        return this.json(`${this.base}/_explain`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(query),
        });
    }

    /** Every Mango index registered in the database. */
    async indexes(): Promise<Array<{ ddoc: string | null; name: string; type: string; def: any }>> {
        const res = await this.json(`${this.base}/_index`);
        return (res.indexes ?? []).map((i: any) => ({
            ddoc: i.ddoc,
            name: i.name,
            type: i.type,
            def: i.def,
        }));
    }

    async designDocIds(): Promise<string[]> {
        const res = await this.json(
            `${this.base}/_all_docs?startkey=%22_design%2F%22&endkey=%22_design0%22`,
        );
        return (res.rows ?? []).map((r: any) => r.id);
    }

    async designDocInfo(ddocId: string): Promise<DesignDocInfo | undefined> {
        try {
            const res = await this.json(`${this.base}/${ddocId.replace("/", "%2F")}/_info`);
            return {
                name: res.name,
                diskSize: res.view_index?.sizes?.file ?? res.view_index?.disk_size ?? 0,
                updateSeq: parseSeq(res.view_index?.update_seq),
                updaterRunning: !!res.view_index?.updater_running,
            };
        } catch {
            // Mango-only design docs have no map/reduce view and expose no `_info`.
            return undefined;
        }
    }

    /** Count documents of a type, for corpus-size context in the report. */
    async countByType(type: string): Promise<number> {
        const res = await this.json(`${this.base}/_find`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                selector: { type },
                fields: ["_id"],
                limit: 100000,
                use_index: "type-index",
            }),
        });
        return (res.docs ?? []).length;
    }

    async find(query: unknown): Promise<any> {
        return this.json(`${this.base}/_find`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(query),
        });
    }

    private async json(url: string, init?: RequestInit): Promise<any> {
        const headers = { ...(init?.headers as Record<string, string>) };
        if (this.authHeader) headers["Authorization"] = this.authHeader;
        const res = await fetch(url, { ...init, headers });
        const text = await res.text();
        if (!res.ok) throw new Error(`CouchDB ${res.status} on ${url}: ${text.slice(0, 200)}`);
        return JSON.parse(text);
    }
}

/** The `use_index` names the API will accept, read from the design-doc JSON on disk. */
export function declaredIndexNames(): Map<string, string> {
    const dir = path.resolve(__dirname, "../../../src/db/designDocs");
    const names = new Map<string, string>();
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        const doc = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
        const id: string = doc._id ?? "";
        if (id.startsWith("_design/")) names.set(id.slice("_design/".length), file);
    }
    return names;
}

function parseSeq(seq: unknown): number {
    if (typeof seq === "number") return seq;
    if (typeof seq === "string") return parseInt(seq.split("-")[0], 10) || 0;
    return 0;
}
