import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nano from "nano";
import * as fs from "fs";
import * as path from "path";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { DatabaseConfig, UserDataConfig } from "../configuration";
import { UserActivityDto } from "../dto/UserActivityDto";
import { isEqualDoc } from "../util/isEqualDoc";
import { loadIndexNames } from "../db/indexNameRegistry";
import { normalizeUserActivityDocument } from "./activityIdentity";

const DESIGN_DOC_DIR = path.join(__dirname, "../db/userDataDesignDocs");
let indexNames: ReadonlySet<string>;
export function getUserDataIndexNames(): ReadonlySet<string> {
    return (indexNames ??= loadIndexNames(DESIGN_DOC_DIR));
}

@Injectable()
export class UserDataDbService {
    private connection: nano.DocumentScope<UserActivityDto>;
    private available = false;

    constructor(
        private readonly config: ConfigService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    get enabled(): boolean {
        return this.available;
    }

    /** One startup attempt, with no change feed, database creation or background retry loop. */
    async initialize(): Promise<void> {
        this.available = false;
        const settings = this.config.get<UserDataConfig>("userData");
        if (!settings?.database && !settings?.idSecret) return;
        if (!settings?.database || !settings?.idSecret) {
            this.logger.error(
                "User-data source disabled: set both DB_USERDATA_DATABASE and USER_DATA_ID_SECRET.",
            );
            return;
        }
        const database = this.config.get<DatabaseConfig>("database");
        if (settings.database === database.database) {
            this.logger.error(
                "User-data source disabled: DB_USERDATA_DATABASE must be a dedicated database.",
            );
            return;
        }
        try {
            this.connection = nano({
                url: database.connectionString,
                requestDefaults: { timeout: 10000 },
            }).use<UserActivityDto>(settings.database);
            // nano 10's declarations predate CouchDB 3's database properties.
            const info = (await this.connection.info()) as nano.DatabaseGetResponse & {
                props?: { partitioned?: boolean };
            };
            if (info.props?.partitioned !== true) {
                this.logger.error(
                    "User-data source disabled: DB_USERDATA_DATABASE must exist and be partitioned.",
                );
                return;
            }
            if (!getUserDataIndexNames().has("sync-userActivity-index")) {
                throw new Error("Missing user-data design documents");
            }
            for (const file of fs.readdirSync(DESIGN_DOC_DIR).filter((f) => f.endsWith(".json"))) {
                const design = JSON.parse(fs.readFileSync(path.join(DESIGN_DOC_DIR, file), "utf8"));
                await this.upsertDesignDoc(design);
            }
            await this.migrateActivityFormat();
            this.available = true;
            this.logger.info("User-data source enabled.");
        } catch (error) {
            // Do not log the connection string, the identity secret or owner keys.
            this.logger.error(
                "User-data source disabled: check the partitioned database, design documents and activity-format migration.",
                {
                    statusCode: error.statusCode,
                    code: error.code,
                },
            );
        }
    }

    assertEnabled(): void {
        if (!this.available) throw new ServiceUnavailableException("User-data source is disabled");
    }

    async partitionedFind(owner: string, query: nano.MangoQuery) {
        this.assertEnabled();
        return this.connection.partitionedFind(owner, query);
    }

    /** Re-read after every conflict so a racing newer activity is never overwritten. */
    async upsert(
        owner: string,
        doc: UserActivityDto,
        maxRetries = 50,
    ): Promise<{ stale: boolean; doc: UserActivityDto }> {
        this.assertEnabled();
        return this.write(owner, doc, maxRetries);
    }

    private async write(
        owner: string,
        doc: UserActivityDto,
        maxRetries = 50,
        preserveTombstone = false,
    ): Promise<{ stale: boolean; doc: UserActivityDto }> {
        const id = `${owner}:${doc._id}`;
        for (let attempt = 0; ; attempt++) {
            const stored = await this.read(id);
            if (stored?.activityTimeUtc > doc.activityTimeUtc) return { stale: true, doc: stored };
            if (
                preserveTombstone &&
                stored?.activityTimeUtc === doc.activityTimeUtc &&
                stored.deleted &&
                !doc.deleted
            )
                return { stale: true, doc: stored };
            const candidate = { ...doc, _id: id };
            if (isEqualDoc(stored, candidate)) return { stale: false, doc: stored };
            candidate.updatedTimeUtc = Date.now();
            if (stored?._rev) candidate._rev = stored._rev;
            else delete candidate._rev;
            try {
                const result = await this.connection.insert(candidate);
                return { stale: false, doc: { ...candidate, _rev: result.rev } };
            } catch (error) {
                if (error.statusCode !== 409 || attempt >= maxRetries) throw error;
                await new Promise((resolve) =>
                    setTimeout(resolve, Math.floor(Math.random() * 10 * (attempt + 1))),
                );
            }
        }
    }

    private async read(id: string): Promise<UserActivityDto | undefined> {
        try {
            return await this.connection.get(id);
        } catch (error) {
            if (error.statusCode === 404) return undefined;
            throw error;
        }
    }

    private async migrateActivityFormat(): Promise<void> {
        const markerId = "_local/userActivityFormat-v2";
        const marker = (await this.read(markerId)) as any;
        if (marker?.format === 2) return;
        let after: string | undefined;
        for (;;) {
            const page = await this.connection.list({
                include_docs: true,
                limit: 100,
                ...(after ? { startkey: after + "\u0000" } : {}),
            });
            if (!page.rows.length) break;
            for (const row of page.rows) {
                const raw = row.doc as any;
                if (!raw || raw.type !== "userActivity") continue;
                // Re-read on conflict; a legacy API may still be finishing an upload.
                for (let attempt = 0; attempt < 10; attempt++) {
                    const current = (await this.read(raw._id)) as any;
                    if (!current) break;
                    const separator = current._id.indexOf(":");
                    if (separator < 1) throw new Error("Invalid legacy activity partition");
                    const owner = current._id.slice(0, separator);
                    const doc = normalizeUserActivityDocument({
                        ...current,
                        _id: current._id.slice(separator + 1),
                    });
                    const canonical = await this.read(`${owner}:${doc._id}`);
                    if (
                        !canonical ||
                        doc.activityTimeUtc > canonical.activityTimeUtc ||
                        (doc.activityTimeUtc === canonical.activityTimeUtc &&
                            doc.deleted &&
                            !canonical.deleted)
                    ) {
                        await this.write(owner, doc, 50, true);
                    }
                    try {
                        await this.connection.destroy(current._id, current._rev);
                        break;
                    } catch (error) {
                        if (error.statusCode === 404) break;
                        if (error.statusCode !== 409 || attempt === 9) throw error;
                    }
                }
            }
            after = page.rows[page.rows.length - 1].id;
        }
        try {
            await this.connection.insert({
                _id: markerId,
                ...(marker?._rev ? { _rev: marker._rev } : {}),
                format: 2,
            } as any);
        } catch (error) {
            if (error.statusCode !== 409 || ((await this.read(markerId)) as any)?.format !== 2)
                throw error;
        }
    }

    private async upsertDesignDoc(design: any): Promise<void> {
        for (let attempt = 0; ; attempt++) {
            const stored = await this.read(design._id);
            if (isEqualDoc(stored, design)) return;
            try {
                await this.connection.insert({
                    ...design,
                    ...(stored?._rev ? { _rev: stored._rev } : {}),
                });
                return;
            } catch (error) {
                if (error.statusCode !== 409 || attempt >= 5) throw error;
            }
        }
    }
}
