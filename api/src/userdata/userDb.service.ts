import { ForbiddenException, Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nano from "nano";
import * as http from "http";
import { EventEmitter } from "stream";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { DatabaseConfig } from "../configuration";
import { DeleteReason, DocType, Uuid } from "../enums";
import { UserContentDto } from "../dto/UserContentDto";
import { UserSettingsDto } from "../dto/UserSettingsDto";
import { DbService } from "../db/db.service";
import { DeleteCmdDto } from "../dto/DeleteCmdDto";

export type UserDataDoc = UserContentDto | UserSettingsDto;

export type UserDbChangesResult = {
    docs: UserDataDoc[];
    lastSeq: string;
};

export type UserDbUpsertResult = {
    id: string;
    rev: string;
    doc: UserDataDoc;
};

const USER_CONTENT_INDEX_DDOC = "userdata-type-idx";
const USER_CONTENT_INDEX_NAME = "by-type";
const USER_CONTENT_CONTENT_ID_INDEX_DDOC = "userdata-type-contentId-idx";
const USER_CONTENT_CONTENT_ID_INDEX_NAME = "by-type-contentId";

/**
 * Service for the partitioned `userdata` CouchDB database. Sibling to
 * DbService — same EventEmitter contract so the socket gateway can listen
 * to both uniformly — but every read/write is scoped to a single user's
 * partition. Security invariants are enforced in every public method:
 *
 *   1. `_id` must start with `{userId}:`
 *   2. `userId` field on the doc must equal the caller's userId
 *   3. Mango queries always go through the partition endpoint, never a
 *      global find
 *
 * The partition key is the userId — see `shared/src/types/userDataDto.ts`
 * for the `_id` convention.
 *
 * @fires UserDbService#update - Emitted for every doc change observed via
 *   the changes feed; shape matches DbService's "update" event so gateway
 *   wiring is uniform.
 */
@Injectable()
export class UserDbService extends EventEmitter implements OnModuleInit {
    private server: nano.ServerScope;
    private db: nano.DocumentScope<UserDataDoc>;
    private readonly dbName: string;
    private readonly dbConfig: DatabaseConfig;
    private ready = false;

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        configService: ConfigService,
        private readonly dbService: DbService,
    ) {
        super();
        this.dbConfig = configService.get<DatabaseConfig>("database");
        this.dbName = this.dbConfig.userDataDatabase;

        // Fail fast: the feature cannot operate without a target DB name.
        // This surfaces misconfiguration at boot rather than at first
        // request, and avoids any hardcoded default name from ever
        // reaching production under the wrong environment.
        if (!this.dbName) {
            throw new Error(
                "USER_DATA_DB env var is required but not set. UserDbService cannot initialise.",
            );
        }

        this.server = nano({
            url: this.dbConfig.connectionString,
            requestDefaults: {
                agent: new http.Agent({ maxSockets: this.dbConfig.maxSockets }),
            },
        });
    }

    async onModuleInit() {
        await this.bootstrap();
        this.startChangesFeed();
        this.subscribeToUserDeletes();
    }

    /**
     * When the CMS deletes a User doc, content-db emits a DeleteCmd
     * with docType=User. The deleted User's `_id` is the partition key
     * for all of that user's private data in the userdata DB — so we
     * sweep the partition on the same event.
     *
     * Async + non-blocking: the CMS delete completes independently of
     * the sweep. If a sweep fails (e.g. transient CouchDB error) the
     * partition leaks until another boot-time reconciliation picks it
     * up. We deliberately do NOT block the CMS flow on this because
     * active sessions can't recreate data — authIdentity.service.ts
     * won't resolve a userId for a deleted User doc, so writes reject.
     */
    private subscribeToUserDeletes() {
        this.dbService.on("update", (doc: any) => {
            if (
                doc?.type === DocType.DeleteCmd &&
                (doc as DeleteCmdDto).docType === DocType.User &&
                (doc as DeleteCmdDto).deleteReason === DeleteReason.Deleted
            ) {
                const deletedUserId = (doc as DeleteCmdDto).docId;
                this.sweepUserPartition(deletedUserId).catch((err) => {
                    this.logger.error(
                        `Failed to sweep userdata partition for deleted user ${deletedUserId}: ${err?.message || err}`,
                    );
                });
            }
        });
    }

    /**
     * Hard-delete every doc in a user's partition. Uses _all_docs via
     * partitionedList to enumerate, then a single _bulk_docs with
     * `_deleted: true` on each row. Idempotent: a re-run on an already-
     * empty partition is a no-op.
     */
    private async sweepUserPartition(userId: Uuid): Promise<void> {
        if (!this.ready) {
            // Bootstrap not finished yet; skip silently. A subsequent
            // DeleteCmd for the same user, or the next cold-start
            // reconciliation, will catch it.
            return;
        }

        const res = await this.db.partitionedList(userId, { include_docs: false });
        if (!res.rows || res.rows.length === 0) return;

        const tombstones = res.rows
            .filter((r: any) => !r.id?.startsWith("_design/"))
            .map((r: any) => ({
                _id: r.id,
                _rev: r.value.rev,
                _deleted: true,
            }));

        if (tombstones.length === 0) return;

        await this.db.bulk({ docs: tombstones as any });
        this.logger.info(
            `Swept ${tombstones.length} docs from userdata partition ${userId}`,
        );
    }

    /**
     * Idempotent bootstrap:
     *   1. Create the database with `partitioned: true` if it doesn't exist.
     *   2. Create partitioned Mango indexes we rely on.
     *
     * Safe to run on every API boot. Does not reset or migrate existing data.
     */
    private async bootstrap() {
        try {
            const dbs = await this.server.db.list();
            if (!dbs.includes(this.dbName)) {
                await this.server.db.create(this.dbName, {
                    partitioned: true,
                } as nano.DatabaseCreateParams);
                this.logger.info(`Created partitioned userdata DB: ${this.dbName}`);
            }
        } catch (err) {
            this.logger.error(
                `Failed to bootstrap userdata DB "${this.dbName}": ${err.message || err}`,
            );
            throw err;
        }

        this.db = this.server.use<UserDataDoc>(this.dbName);
        await this.ensureIndexes();
        this.ready = true;
        this.logger.info(`UserDbService ready (db="${this.dbName}")`);
    }

    /**
     * Create partitioned Mango indexes. CouchDB returns the same response
     * whether the index is newly created or already existed, so the call
     * is idempotent.
     */
    private async ensureIndexes() {
        await this.db.createIndex({
            ddoc: USER_CONTENT_INDEX_DDOC,
            name: USER_CONTENT_INDEX_NAME,
            index: { fields: ["type"] },
            type: "json",
            partitioned: true,
        } as nano.CreateIndexRequest);

        await this.db.createIndex({
            ddoc: USER_CONTENT_CONTENT_ID_INDEX_DDOC,
            name: USER_CONTENT_CONTENT_ID_INDEX_NAME,
            index: { fields: ["type", "contentId"] },
            type: "json",
            partitioned: true,
        } as nano.CreateIndexRequest);
    }

    private startChangesFeed() {
        this.db.changesReader
            .start({ includeDocs: true })
            .on("change", (update: any) => {
                if (update.doc && update.doc.type) {
                    this.emit("update", update.doc);
                }
            })
            .on("error", (err: any) => {
                this.logger.warn(
                    `userdata changes feed error, will restart: ${err.message || err}`,
                );
                // Simple restart — DbService has full reconnect/backoff logic we can
                // mirror here if operational experience shows we need it. Starting
                // with the minimal version since the DB is the same CouchDB cluster
                // as content-db; reliability tracks that service.
                setTimeout(() => this.startChangesFeed(), 1000);
            });
    }

    /* ─────────────────── partition-scoped reads ─────────────────── */

    /**
     * Run a Mango find inside a single user's partition. Selector is
     * appended to the partition scope server-side — CouchDB guarantees
     * docs from other partitions are not returned regardless of the
     * selector contents.
     */
    async findInPartition(
        userId: Uuid,
        selector: nano.MangoSelector,
        limit?: number,
    ): Promise<UserDataDoc[]> {
        this.assertReady();
        const query: nano.MangoQuery = { selector };
        if (limit !== undefined) query.limit = limit;
        const res = await this.db.partitionedFind(userId, query);
        return (res.docs ?? []) as UserDataDoc[];
    }

    /**
     * Fetch a single doc by id, validating that the caller owns it.
     * Returns null if the doc is missing — callers should not treat a
     * missing doc as an error since partitions are implicit and most
     * reads are speculative.
     */
    async getDocInPartition(userId: Uuid, docId: string): Promise<UserDataDoc | null> {
        this.assertReady();
        this.assertPartitionOwnership(userId, docId);
        try {
            const doc = await this.db.get(docId);
            return doc as UserDataDoc;
        } catch (err) {
            if ((err as any).statusCode === 404) return null;
            throw err;
        }
    }

    /**
     * Partition-scoped changes feed for incremental sync. `since` is the
     * client's last-known sequence token.
     */
    async getChangesInPartition(userId: Uuid, since?: string): Promise<UserDbChangesResult> {
        this.assertReady();
        // nano exposes partition changes via the HTTP endpoint directly;
        // the wrapper API calls it through the server-scope request.
        const res: any = await this.server.request({
            db: this.dbName,
            path: `_partition/${encodeURIComponent(userId)}/_changes`,
            method: "GET",
            qs: {
                include_docs: true,
                since: since ?? "0",
            },
        });
        const docs = (res.results ?? [])
            .map((r: any) => r.doc)
            .filter((d: any): d is UserDataDoc => d && typeof d.type === "string");
        return { docs, lastSeq: res.last_seq };
    }

    /* ─────────────────── partition-scoped writes ─────────────────── */

    /**
     * Insert or update a doc inside the caller's partition. For UserContent
     * docs this performs merge-on-write:
     *   - highlights are unioned by `.id` (append-only across devices)
     *   - readingPos is LWW by `updatedTimeUtc`
     *   - updatedTimeUtc becomes max of current and incoming
     *
     * UserSettings docs are written with plain LWW semantics.
     *
     * Throws ForbiddenException if the doc's ownership does not match
     * the caller's userId — never trust client-supplied `_id`/`userId`.
     */
    async upsertInPartition(userId: Uuid, incoming: UserDataDoc): Promise<UserDbUpsertResult> {
        this.assertReady();
        this.assertPartitionOwnership(userId, incoming);

        const current = await this.getDocInPartition(userId, incoming._id);
        const toWrite = current
            ? this.mergeForWrite(current, incoming)
            : this.prepareFirstWrite(incoming);

        const result = await this.db.insert(toWrite as any);
        return {
            id: result.id,
            rev: result.rev,
            doc: { ...toWrite, _rev: result.rev } as UserDataDoc,
        };
    }

    /**
     * Mark a doc as deleted. We write a deletion tombstone rather than
     * hard-deleting so the change flows through the changes feed and
     * reaches other devices, matching how DeleteCmd works for content.
     */
    async softDeleteInPartition(userId: Uuid, docId: string): Promise<void> {
        this.assertReady();
        this.assertPartitionOwnership(userId, docId);
        const current = await this.getDocInPartition(userId, docId);
        if (!current) return;
        await this.db.destroy(docId, current._rev!);
    }

    /* ─────────────────── invariants ─────────────────── */

    private assertReady() {
        if (!this.ready) throw new Error("UserDbService is not ready — DB bootstrap pending");
    }

    /**
     * Enforces the two security invariants on every write/read-by-id:
     *   - the `_id` prefix equals `{userId}:`
     *   - the `userId` field on the doc body equals the caller's userId
     *
     * Accepts either a doc or a raw id string. Never trust the client —
     * every call must re-validate, even when the controller already
     * pulled userId from the JWT.
     */
    private assertPartitionOwnership(userId: Uuid, docOrId: UserDataDoc | string): void {
        const docId = typeof docOrId === "string" ? docOrId : docOrId._id;
        const prefix = `${userId}:`;
        if (!docId || !docId.startsWith(prefix)) {
            throw new ForbiddenException("Partition key mismatch on _id");
        }
        if (typeof docOrId !== "string" && docOrId.userId !== userId) {
            throw new ForbiddenException("userId field does not match caller");
        }
    }

    /**
     * First write for this `_id`: strip client-supplied `_rev`, ensure
     * timestamps are set, let CouchDB assign the rev.
     */
    private prepareFirstWrite(incoming: UserDataDoc): UserDataDoc {
        const now = Date.now();
        const doc = { ...incoming } as UserDataDoc;
        delete (doc as any)._rev;
        if (!doc.createdAt) doc.createdAt = now;
        if (!doc.updatedTimeUtc) doc.updatedTimeUtc = now;
        return doc;
    }

    /**
     * Merge an incoming write with the server's current version.
     *
     * For UserContent we preserve highlights across concurrent edits
     * from multiple devices: the union of highlight.ids is kept, even if
     * incoming.updatedTimeUtc is older than current. This gives highlights
     * append-only semantics and eliminates the most common "I added a
     * highlight on my phone and it disappeared when my tablet synced"
     * failure mode.
     *
     * For UserSettings and the non-highlight fields of UserContent
     * (readingPos), plain LWW by updatedTimeUtc applies — that's the
     * correct behaviour for a per-user singleton state.
     */
    private mergeForWrite(current: UserDataDoc, incoming: UserDataDoc): UserDataDoc {
        if (current.type !== incoming.type) {
            // Shouldn't happen in practice — deterministic ids pin type.
            // Treat as forbidden rather than overwriting.
            throw new ForbiddenException("Doc type mismatch on upsert");
        }

        const incomingTs = incoming.updatedTimeUtc ?? 0;
        const currentTs = current.updatedTimeUtc ?? 0;
        const newerIsIncoming = incomingTs >= currentTs;

        if (current.type === DocType.UserSettings && incoming.type === DocType.UserSettings) {
            const base = newerIsIncoming ? incoming : current;
            return {
                ...base,
                _id: current._id,
                _rev: current._rev,
                userId: current.userId,
                createdAt: current.createdAt,
                updatedTimeUtc: Math.max(currentTs, incomingTs),
            } as UserSettingsDto;
        }

        if (current.type === DocType.UserContent && incoming.type === DocType.UserContent) {
            const mergedHighlights = this.mergeHighlights(current.highlights, incoming.highlights);
            const readingPosSource = newerIsIncoming ? incoming : current;
            return {
                _id: current._id,
                _rev: current._rev,
                type: DocType.UserContent,
                userId: current.userId,
                contentId: current.contentId,
                createdAt: current.createdAt,
                updatedTimeUtc: Math.max(currentTs, incomingTs),
                readingPos: readingPosSource.readingPos,
                highlights: mergedHighlights,
            } as UserContentDto;
        }

        // Unknown user-data type — shouldn't happen, but don't silently
        // drop data: prefer the server's current version.
        return current;
    }

    /**
     * Union of highlight arrays keyed by `.id`. When the same id appears
     * on both sides, the incoming version wins only if it's a true update
     * (callers should not mutate ids in place, so identical ids with
     * different content means an edit). The simple rule: incoming wins
     * on id collisions. Deleted-by-omission is NOT supported — deletions
     * must go through an explicit mutation (client filters the array and
     * resubmits, but the server keeps the union, so deletes happen via
     * the softDelete path or via a future explicit `removedHighlightIds`
     * tombstone field). This is a deliberate trade-off for append-only
     * safety in the common case.
     */
    private mergeHighlights(
        current: UserContentDto["highlights"],
        incoming: UserContentDto["highlights"],
    ): UserContentDto["highlights"] {
        if (!current && !incoming) return undefined;
        const byId = new Map<string, NonNullable<UserContentDto["highlights"]>[number]>();
        for (const h of current ?? []) byId.set(h.id, h);
        for (const h of incoming ?? []) byId.set(h.id, h);
        return byId.size > 0 ? Array.from(byId.values()) : undefined;
    }
}
