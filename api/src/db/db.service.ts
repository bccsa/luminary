import { Injectable, Inject } from "@nestjs/common";
import * as nano from "nano";
import { DeleteReason, DocType, PublishStatus, Uuid } from "../enums";
import { ConfigService } from "@nestjs/config";
import { DatabaseConfig, SyncConfig } from "../configuration";
import * as http from "http";
import { EventEmitter } from "stream";
import { instanceToPlain } from "class-transformer";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { _baseDto } from "../dto/_baseDto";
import { DeleteCmdDto } from "../dto/DeleteCmdDto";
import { randomUUID } from "crypto";
import { _contentBaseDto } from "../dto/_contentBaseDto";
import { ContentDto } from "../dto/ContentDto";
import { isEqualDoc } from "../util/isEqualDoc";
import { isDeepStrictEqual } from "util";
import { assertNoNullInArrayOperators } from "./assertNoNullInArrayOperators";

/**
 * @typedef {Object} - getDocsOptions
 * @property {Array<Uuid>} groups - Array with IDs of groups for which member documents should be returned.
 * Note: If the "group" type is included in getDocsOptions.types, the group itself will be included in the result.
 * @property {Array<DocType>} types - Array of document types to be included in the query result
 * @property {number} from - Include documents with an updateTimeUtc timestamp greater or equal to the passed value. (Default 0)
 */
export type GetDocsOptions = {
    userAccess: Map<DocType, Uuid[]>; // Map of document types and the user's access to them
    group: string;
    from?: number;
    to?: number;
    limit?: number;
    type: DocType;
    contentOnly?: boolean;
};

/**
 * Standardized format for database query results
 * @param {Array<any>} docs - Array of database returned documents
 * @param {Array<string>} warnings - Array of warnings
 * @param {number} version - Timestamp of the latest document update
 */
export type DbQueryResult = {
    docs: Array<any>;
    warnings?: Array<string>;
    warning?: string;
    bookmark?: string;
    version?: number;
    blockStart?: number;
    blockEnd?: number;
    group?: string;
    type?: DocType;
    contentOnly?: boolean;
    execution_stats?: {
        total_keys_examined?: number;
        total_docs_examined?: number;
        total_quorum_docs_examined?: number;
        results_returned?: number;
        execution_time_ms?: number;
    };
};

/**
 * Database upsert results
 */
export type DbUpsertResult = {
    id: string;
    ok: boolean;
    rev: string;
    updatedTimeUtc?: number;
    message?: string;
    changes?: any;
};

/**
 * Embedded value of a row in the `fts-trigram-index` CouchDB view.
 * Carries the document's term frequency for the row's trigram plus the doc-level
 * metadata needed to permission/visibility-filter candidates without loading the
 * documents. See ADR 0010.
 */
export type FtsCandidateValue = [
    number, // [0] tf (boosted term frequency)
    DocType, // [1] parentType
    PublishStatus, // [2] status
    number | null, // [3] publishDate
    number | null, // [4] expiryDate
    Uuid, // [5] language
    Uuid[], // [6] memberOf
    Uuid[], // [7] parentTags
    number | null, // [8] updatedTimeUtc (for strict-mode sort)
    string | null, // [9] title (for strict-mode substring match + sort)
    string | null, // [10] author (for strict-mode substring match)
];

/** A single candidate row returned by {@link DbService.ftsTrigramCandidates}. */
export type FtsCandidateRow = {
    trigram: string;
    docId: Uuid;
    value: FtsCandidateValue;
};

/**
 * Named per-row metadata emitted by the per-doctype *aux* FTS trigram views
 * (`fts-trigram-index-user`, `fts-trigram-index-redirect`). Unlike {@link FtsCandidateValue}
 * (a positional tuple), aux views emit a self-describing object: `memberOf` for permission
 * scoping plus the searchable/sortable fields used by the strict search path. Strict mode
 * does not score, so there is no `tf`.
 */
export type UserFtsMeta = {
    memberOf: Uuid[];
    name: string | null;
    email: string | null;
    lastLogin: number | null;
    updatedTimeUtc: number | null;
};

export type RedirectFtsMeta = {
    memberOf: Uuid[];
    slug: string | null;
    toSlug: string | null;
    updatedTimeUtc: number | null;
};

/** A single candidate row returned by {@link DbService.ftsAuxTrigramCandidates}. */
export type AuxFtsCandidateRow<M> = {
    trigram: string;
    docId: Uuid;
    value: M;
};

/**
 * View-read options for the FTS path. `update: "lazy"` returns immediately from the
 * current index instead of blocking the read to bring the view up to date, then
 * schedules an update afterwards so the index keeps converging (so newly-ingested
 * content becomes searchable shortly after, without each search paying the index-update
 * cost). `stable: true` reads from a consistent shard snapshot so the multiple FTS view
 * reads in one query score against the same index state. FTS tolerates slight staleness
 * (ADR 0010).
 */
const FTS_STALE_READ = { stable: true, update: "lazy" as const };

/**
 * Database service for interacting with CouchDB.
 * Provides methods for CRUD operations, document synchronization, and query execution.
 *
 * @extends EventEmitter
 *
 * @fires DbService#update - Emitted when any valid document with a type field is updated in the database
 * @fires DbService#groupUpdate - Emitted when a group document is updated, used by the permission system to update access maps. Also emitted with a `DeleteCmd` payload (docType === Group) when a group is deleted via the soft-delete flow, so the permission system can evict the entry.
 * @fires DbService#disconnect - Emitted when a previously-established DB connection is lost. Consumers should drop cached DTO state that may have diverged while disconnected.
 * @fires DbService#reconnect - Emitted after a disconnect has been followed by a successful reconnect. Consumers that need a populated cache to function should rehydrate here.
 *
 * @example
 * // Listen for document updates
 * dbService.on('update', (doc) => {
 *   console.log('Document updated:', doc);
 * });
 *
 * @example
 * // Listen for group updates
 * dbService.on('groupUpdate', (groupDoc) => {
 *   console.log('Group updated:', groupDoc);
 * });
 */
@Injectable()
export class DbService extends EventEmitter {
    private db: any;
    protected syncTolerance: number;
    private connected = false;
    // Tracks an unmatched 'disconnect' emit. Used to gate the next 'reconnect'
    // emit so it pairs with a real prior disconnect, rather than firing on the
    // initial connect or on whichever waitForDb() happens to resolve second
    // when two are racing (see startChangesFeed error handler).
    private disconnectEmitted = false;
    private dbConfig: DatabaseConfig;
    private reconnecting = false;
    private readonly maxReconnectDelay = 30000;
    /** Short-lived cache of FTS corpus stats; recomputing per search is wasteful as it changes slowly. */
    private ftsCorpusStatsCache?: {
        value: { docCount: number; totalTokenCount: number };
        expiresAt: number;
    };
    private readonly ftsCorpusStatsTtlMs = 60000;

    /**
     * Sequence cursor of the last change delivered to listeners. Passed as
     * `since` to the CouchDB `_changes` feed when we (re)start it.
     *
     * Initialised to `"now"` — CouchDB resolves this to the current
     * `update_seq` at request time and only delivers changes from that point
     * forward. We do NOT use `0` (replay all history) because at cold start
     * each consumer already loads its own snapshot via direct queries
     * (PermissionSystem groups, QueryService languages, etc.), so replaying
     * history would just re-fire emits for state we already have.
     *
     * After the first change is processed this holds a real seq value, so a
     * reconnect resumes from the exact point we left off — that's how the
     * in-memory caches recover updates that landed during the disconnect
     * window without a full snapshot refetch. nano's own default for `since`
     * is also `"now"`, so passing this on first connect matches that
     * behaviour.
     */
    private lastSeq: string | number = "now";

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private configService: ConfigService,
    ) {
        super();
        this.dbConfig = this.configService.get<DatabaseConfig>("database");
        const syncConfig = this.configService.get<SyncConfig>("sync");

        this.syncTolerance = syncConfig.tolerance;
        this.connect();
    }

    /**
     * Connect to the database and start the changes feed.
     * The changes feed starts immediately so events are received as soon as possible.
     * If the DB isn't available yet, the feed's error handler triggers reconnection.
     */
    private connect() {
        this.db = nano({
            url: this.dbConfig.connectionString,
            requestDefaults: {
                agent: new http.Agent({
                    maxSockets: this.dbConfig.maxSockets,
                    // Reuse TCP connections across requests so each CouchDB round trip
                    // doesn't pay connection-setup latency (notably the multi-round-trip
                    // FTS search path).
                    keepAlive: true,
                }),
            },
        }).use(this.dbConfig.database);

        // Start the changes feed immediately (its error handler will trigger reconnect if DB is down)
        this.startChangesFeed();

        // Verify the connection in the background so ensureConnected() can unblock callers
        this.waitForDb().catch((err) => {
            this.logger.error("Unexpected error in waitForDb:", err);
        });
    }

    /**
     * Wait for the database to become available, retrying with exponential backoff.
     */
    private async waitForDb() {
        let delay = 1000;
        while (true) {
            try {
                await this.db.info();
                this.connected = true;
                this.logger.info("Connected to database");
                // Only emit 'reconnect' if we previously emitted a 'disconnect'.
                // Clear the flag first so a concurrent waitForDb() resolving
                // afterwards doesn't double-emit.
                if (this.disconnectEmitted) {
                    this.disconnectEmitted = false;
                    this.emit("reconnect");
                }
                return;
            } catch (err) {
                this.connected = false;
                this.logger.warn(
                    `Database not available, retrying in ${delay / 1000}s: ${err.message || err}`,
                );
                await new Promise((r) => setTimeout(r, delay));
                delay = Math.min(delay * 2, this.maxReconnectDelay);
            }
        }
    }

    /**
     * Start the CouchDB changes feed. Automatically restarts on error with backoff.
     */
    private startChangesFeed() {
        this.db.changesReader
            .start({ includeDocs: true, since: this.lastSeq })
            .on("change", (update) => {
                // emit update event for all valid documents
                if (update.doc && update.doc.type) {
                    // emit update event for all valid documents
                    this.emit("update", update.doc);

                    // Emit specific group document update event (used by permission system to update access maps)
                    if (update.doc.type === "group") {
                        this.emit("groupUpdate", update.doc);
                    }

                    // Emit specific language document update event
                    else if (update.doc.type === DocType.Language) {
                        this.emit("languageUpdate", update.doc);
                    }

                    // Emit delete commands for documents whose deletion is observed
                    // by a typed cache (languages, groups). The DeleteCmd is the
                    // only typed signal a hard-delete leaves in the change feed —
                    // the subsequent CouchDB tombstone has no `type` field and is
                    // dropped by the guard above — so cache consumers must reconcile
                    // off the DeleteCmd, not the tombstone.
                    else if (update.doc.type === DocType.DeleteCmd) {
                        const doc = update.doc as DeleteCmdDto;
                        if (doc.deleteReason === DeleteReason.Deleted) {
                            if (doc.docType === DocType.Group) {
                                this.emit("groupUpdate", doc);
                            } else {
                                this.emit("languageUpdate", doc);
                            }
                        }
                    }
                }

                // Advance the resume cursor after listeners run so a crash
                // mid-handler causes the change to be re-delivered on the next
                // reconnect rather than silently skipped.
                if (update.seq !== undefined) {
                    this.lastSeq = update.seq;
                }
            })
            .on("error", (err) => {
                this.logger.warn("Database changes feed error, will restart:", err.message || err);
                const wasConnected = this.connected;
                this.connected = false;
                // Only emit 'disconnect' on a real connected→disconnected
                // transition. A feed error during initial connect (DB down at
                // boot) is not a disconnect from a listener's perspective.
                if (wasConnected) {
                    this.disconnectEmitted = true;
                    this.emit("disconnect");
                }
                this.reconnect();
            })
            .on("close", () => {
                if (this.connected) {
                    this.logger.warn("Database changes feed closed unexpectedly, will restart");
                    this.connected = false;
                    this.disconnectEmitted = true;
                    this.emit("disconnect");
                    this.reconnect();
                }
            });
    }

    /**
     * Reconnect to the database and restart the changes feed.
     * Uses exponential backoff and prevents concurrent reconnection attempts.
     */
    private async reconnect() {
        if (this.reconnecting) return;
        this.reconnecting = true;

        try {
            // Stop the existing changes feed
            try {
                this.db.changesReader.stop();
            } catch {
                // Ignore errors when stopping - it may already be stopped
            }

            await this.waitForDb();
            this.startChangesFeed();
        } finally {
            this.reconnecting = false;
        }
    }

    /**
     * Ensure the database is connected before executing an operation.
     * If disconnected, waits for reconnection.
     */
    private async ensureConnected() {
        if (this.connected) return;

        this.logger.warn("Database operation waiting for connection...");
        // Trigger reconnection if not already in progress
        this.reconnect();

        // Wait until connected, polling every 500ms with a 10 second timeout
        const maxWaitMs = 10000;
        const pollIntervalMs = 500;
        let waited = 0;

        while (!this.connected) {
            if (waited >= maxWaitMs) {
                throw new Error("Database connection timeout: unable to connect within 10 seconds");
            }
            await new Promise((r) => setTimeout(r, pollIntervalMs));
            waited += pollIntervalMs;
        }
    }

    /**
     * Insert a document into the database. Automatically retries on document update conflicts
     * by fetching the latest revision and retrying.
     *
     * Uses jitter (random delay) on retry to prevent concurrent writers from repeatedly
     * colliding at the same instant -- spreading them out so most succeed without conflicting.
     *
     * @param {any} doc - Document to be inserted
     * @param {number} maxRetries - Safety net to prevent infinite loops (default 50)
     * @returns - Promise containing the insert result
     */
    async insertDoc(doc: any, maxRetries: number = 50): Promise<DbUpsertResult> {
        await this.ensureConnected();
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const insertResult = await this.db.insert(doc);
                return {
                    id: insertResult.id,
                    ok: insertResult.ok,
                    rev: insertResult.rev,
                };
            } catch (err) {
                if (err.reason === "Document update conflict." && attempt < maxRetries) {
                    // Random delay to stagger concurrent writers and reduce repeated collisions
                    const jitter = Math.floor(Math.random() * 10 * (attempt + 1));
                    await new Promise((r) => setTimeout(r, jitter));

                    const existing = await this.getDoc(doc._id);
                    if (existing.docs?.length > 0) {
                        doc._rev = existing.docs[0]._rev;
                    } else {
                        throw new Error(err.message || err.reason || String(err));
                    }
                } else {
                    throw new Error(err.message || err.reason || String(err));
                }
            }
        }
    }

    /**
     * Insert or update a document with given ID.
     * @param doc - CouchDB document with an _id field
     */
    async upsertDoc(doc: any): Promise<DbUpsertResult> {
        if (!doc._id) {
            throw new Error(
                "Invalid document: The passed document does not have an '_id' property",
            );
        }

        const res = await this.getDoc(doc._id);

        let existing: _baseDto; // if no existing document, this will be undefined
        if (res.docs && res.docs.length > 0) {
            existing = res.docs[0];
        }

        // Check that the document type is not changed
        if (existing && existing.type !== doc.type) {
            throw new Error(
                `Document type change not allowed. Existing type: ${existing.type}, New type: ${doc.type}`,
            );
        }

        let rev: string;

        // Generate delete command if the document is set to be deleted, and delete the document
        if (doc.deleteReq) {
            await this.insertDeleteCmd({
                reason: DeleteReason.Deleted,
                doc: doc as _baseDto,
                prevDoc: existing as _contentBaseDto,
            });

            return await this.deleteDoc(doc._id);
        } else {
            // Generate delete command if the document's memberOf field has changed
            if (
                existing &&
                doc.type !== DocType.Group &&
                (existing as _contentBaseDto).memberOf &&
                doc.memberOf &&
                !isDeepStrictEqual(
                    (existing as _contentBaseDto).memberOf.sort(),
                    doc.memberOf.sort(),
                )
            ) {
                await this.insertDeleteCmd({
                    reason: DeleteReason.PermissionChange,
                    doc: doc as _contentBaseDto,
                    prevDoc: existing as _contentBaseDto,
                });
            }

            // Cleanup the obsolete StatusChange deleteCmd when switching content from draft to
            // published. The deleteCmd's `_id` is tracked on the draft doc itself
            // (`statusChangeDeleteCmdId`), so we can delete it by primary key — strongly consistent.
            // Pre-fix orphan deleteCmds (no tracking field) are handled by a one-time schema
            // upgrade in `schemaUpgrade/v15.ts`.
            if (
                existing &&
                doc.type === DocType.Content &&
                (existing as ContentDto).status === PublishStatus.Draft &&
                (doc as ContentDto).status === PublishStatus.Published
            ) {
                const trackedId = (existing as ContentDto).statusChangeDeleteCmdId;
                if (trackedId) {
                    await this.deleteDoc(trackedId);
                }

                // Don't carry the field forward onto the republished doc.
                delete (doc as ContentDto).statusChangeDeleteCmdId;
            }

            // Generate delete command if the document's status has changed to draft
            if (
                existing &&
                doc.type === DocType.Content &&
                (existing as ContentDto).status === PublishStatus.Published &&
                (doc as ContentDto).status === PublishStatus.Draft
            ) {
                const result = await this.insertDeleteCmd({
                    reason: DeleteReason.StatusChange,
                    doc: doc as ContentDto,
                    prevDoc: existing as _contentBaseDto,
                });
                // Track the deleteCmd ID on the draft so a future republish can delete it by
                // primary key (strongly consistent) instead of relying on an unindexed Mango find.
                (doc as ContentDto).statusChangeDeleteCmdId = result.id;
            }
        }

        // Remove revision and updateTimeUtc from existing doc from database for comparison purposes
        if (existing) {
            rev = existing._rev as string;
        }

        // Convert the document to plain object to compare with the existing document
        const docPlain = instanceToPlain(doc);
        docPlain.updatedTimeUtc = Date.now();
        docPlain._rev = rev;

        if (!existing) {
            // Passed document does not exist in database: create
            const res = await this.insertDoc(docPlain);
            res.updatedTimeUtc = docPlain.updatedTimeUtc;
            res.changes = docPlain;
            return res;
        }

        if (isEqualDoc(docPlain, existing)) {
            // Document in DB is the same as passed doc: do nothing
            return {
                id: docPlain._id,
                ok: true,
                rev: rev,
                message: "Document is identical to the one in the database",
            };
        }

        // Passed document is different than document in DB: update
        const changes = this.calculateDiff(docPlain, existing);
        const insertResult = await this.insertDoc(docPlain);
        insertResult.updatedTimeUtc = docPlain.updatedTimeUtc;
        insertResult.changes = changes;
        return insertResult;
    }

    /**
     * Get a single document by ID
     * @param id - document ID (_id field)
     */
    async getDoc(docId: string): Promise<DbQueryResult> {
        await this.ensureConnected();
        return new Promise((resolve, reject) => {
            this.db
                .get(docId)
                .then((res) => {
                    resolve({ docs: [res] });
                })
                .catch((err) => {
                    if (err.reason == "missing") {
                        resolve({ docs: [], warnings: ["Document not found"] });
                    }
                    if (err.reason == "deleted") {
                        resolve({ docs: [], warnings: ["Document is deleted"] });
                    } else {
                        reject(err);
                    }
                });
        });
    }

    /**
     * Get multiple documents by ID and type
     * @param {Uuid[]} docIds - Document IDs to be included in search.
     * @param {DocType[]} types - Document types to be included in search
     * @returns - Promise containing the query result
     */
    async getDocs(docIds: Uuid[], types: DocType[]): Promise<DbQueryResult> {
        await this.ensureConnected();
        return new Promise((resolve, reject) => {
            if (!docIds || docIds.length < 1 || !types || types.length < 1) {
                resolve({ docs: [], warnings: ["No document IDs or document types specified"] });
            }
            this.db
                .fetch({ keys: docIds })
                .then((res: nano.DocumentFetchResponse<unknown>) => {
                    // reduce the result to only include valid documents that match the passed types
                    const docs = res.rows
                        .filter((row: any) => row.doc && types.includes(row.doc.type))
                        .map((row: any) => row.doc);
                    resolve({ docs });
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * Insert a delete command document into the database. Note that this function is not deleting the document (doc) itself, but creating a command for the clients delete it.
     * Note: This function cannot generate multiple delete commands (e.g. when both the the memberOf and status fields have changed). This needs to be handled by the caller.
     * @param doc - Document to create a delete command for
     * @param reason - Reason for the delete command
     * @param prevDoc? - Previous version of the document (optional for if the document was updated and not deleted)
     */
    async insertDeleteCmd<T extends _baseDto>(options: {
        reason: DeleteReason;
        doc: T;
        prevDoc?: T;
    }): Promise<DbUpsertResult> {
        if (!options.prevDoc) {
            return {
                id: "",
                ok: true,
                message: "No delete command needed as the document does not exist in the database",
            } as DbUpsertResult;
        }

        const cmd = {
            _id: randomUUID(),
            type: DocType.DeleteCmd,
            docId: options.doc._id,
            // Set the docType field of delete commands for Content documents to the parentType field of the content document.
            // This is needed as the permission system does not include Content documents, but bases permissions on the parent type (Post / Tag).
            docType:
                options.doc.type === DocType.Content
                    ? (options.doc as unknown as ContentDto).parentType
                    : options.doc.type,
            updatedTimeUtc: Date.now(),
            deleteReason: options.reason,
        } as DeleteCmdDto;

        if (options.doc.type === DocType.Content && options.prevDoc) {
            cmd.language = (options.prevDoc as unknown as ContentDto).language;
        }

        if ((options.doc as unknown as any).slug) {
            cmd.slug = (options.doc as unknown as ContentDto).slug;
        }

        const d = options.doc as unknown as _contentBaseDto;
        const p = options.prevDoc as unknown as _contentBaseDto;

        if (options.reason === DeleteReason.Deleted) {
            cmd.memberOf = p.memberOf;
        }

        if (options.reason === DeleteReason.StatusChange) {
            if (options.doc.type !== DocType.Content) {
                throw new Error("Status change delete command is only valid for content documents");
            }

            const contentDoc = options.doc as unknown as ContentDto;

            if (contentDoc.status === PublishStatus.Published) {
                throw new Error(
                    "Status change delete command is only valid for unpublished content",
                );
            }

            cmd.memberOf = d.memberOf;
        }

        if (options.reason === DeleteReason.PermissionChange) {
            // Get a diff between the previous and current memberOf arrays. The delete command only needs to be sent to the groups that have been removed from the memberOf array.
            const memberOf = d.memberOf || [];
            const prevMemberOf = p.memberOf || [];
            const diff = prevMemberOf.filter((x) => !memberOf.includes(x));

            if (diff.length < 1) {
                return {
                    id: "",
                    ok: true,
                    rev: "",
                    message: "No delete command needed as no groups were removed",
                } as DbUpsertResult;
            }

            cmd.memberOf = diff;
            cmd.newMemberOf = d.memberOf;
        }

        return await this.insertDoc(cmd);
    }

    /**
     * Delete a document from the database
     * @param docId - Document ID to be deleted
     */
    async deleteDoc(docId: string): Promise<DbUpsertResult> {
        await this.ensureConnected();
        const existingDoc = await this.getDoc(docId);
        if (existingDoc.docs.length < 1) {
            return {
                id: docId,
                ok: true,
                rev: "",
                message: "Document not found",
            };
        }

        const res = await this.db.destroy(docId, existingDoc.docs[0]._rev);
        return {
            id: docId,
            ok: res.ok,
            rev: res.rev,
        };
    }

    /**
     * Gets the latest document update time for any documents that has the updatedTimeUtc property
     */
    async getLatestDocUpdatedTime(): Promise<number> {
        await this.ensureConnected();
        return new Promise((resolve) => {
            this.db
                .view("sync_deprecated", "updatedTimeUtc", {
                    limit: 1,
                    descending: true,
                })
                .then((res) => {
                    if (
                        res.rows &&
                        res.rows[0] &&
                        res.rows[0].value &&
                        typeof res.rows[0].value === "number"
                    ) {
                        resolve(res.rows[0].value);
                    } else {
                        resolve(0);
                    }
                });
        });
    }

    /**
     * calculate the start and end of the block, used to pass back to the client for pagination
     * @param docs - List of documents
     * @returns
     */
    calcBlockStartEnd(docs: any[]): { blockStart: number; blockEnd: number } {
        const blockStart: number =
            docs.length < 1
                ? 0
                : docs.reduce(
                      (prev: { updatedTimeUtc: number }, curr: { updatedTimeUtc: number }) =>
                          prev.updatedTimeUtc > curr.updatedTimeUtc ? prev : curr,
                  ).updatedTimeUtc;
        const blockEnd: number =
            docs.length < 1
                ? 0
                : docs.reduce(
                      (prev: { updatedTimeUtc: number }, curr: { updatedTimeUtc: number }) =>
                          prev.updatedTimeUtc < curr.updatedTimeUtc ? prev : curr,
                  ).updatedTimeUtc;

        return { blockStart, blockEnd };
    }

    /**
     * Execute a database find query
     * @param query - Database query to be executed
     * @returns - Promise containing the query result
     */
    async executeFindQuery(query: nano.MangoQuery): Promise<DbQueryResult> {
        // Defense-in-depth: a null member of an $in/$nin/$all array crashes CouchDB's
        // _find with an opaque function_clause. Fail loud and clear here — this is the
        // only path to nano.db.find, so it also covers the search/sync/languages
        // callers that don't pass through /query's validateQuery.
        assertNoNullInArrayOperators(query);
        await this.ensureConnected();
        const res: DbQueryResult = await this.db.find(query);

        // calculate the start and end of the block, used to pass back to the client for pagination
        const { blockStart, blockEnd } = this.calcBlockStartEnd(res.docs);

        res.blockStart = blockStart;
        res.blockEnd = blockEnd;
        return res;
    }

    /**
     * FTS: corpus-level statistics for BM25 scoring, served by the
     * `fts-corpus-stats` view's `_stats` reduce.
     * @returns the number of indexed Content documents (`docCount`) and the sum of
     * their `ftsTokenCount` (`totalTokenCount`, used to derive average doc length).
     */
    async ftsCorpusStats(): Promise<{ docCount: number; totalTokenCount: number }> {
        const cached = this.ftsCorpusStatsCache;
        if (cached && cached.expiresAt > Date.now()) return cached.value;

        await this.ensureConnected();
        const res = await this.db.view("fts-corpus-stats", "fts-corpus-stats", {
            ...FTS_STALE_READ,
            reduce: true,
            group: false,
        });
        const stats = res.rows && res.rows[0] && res.rows[0].value;
        const value = stats
            ? { docCount: stats.count || 0, totalTokenCount: stats.sum || 0 }
            : { docCount: 0, totalTokenCount: 0 };
        this.ftsCorpusStatsCache = { value, expiresAt: Date.now() + this.ftsCorpusStatsTtlMs };
        return value;
    }

    /**
     * FTS: document frequency (number of Content docs containing each trigram),
     * served by the `fts-trigram-index` view's `_count` reduce with `group=true`.
     * Used to drop over-common trigrams and to compute IDF.
     */
    async ftsTrigramDf(trigrams: string[]): Promise<Map<string, number>> {
        await this.ensureConnected();
        const df = new Map<string, number>();
        if (!trigrams || trigrams.length === 0) return df;
        const res = await this.db.view("fts-trigram-index", "fts-trigram-index", {
            ...FTS_STALE_READ,
            keys: trigrams,
            group: true,
            reduce: true,
        });
        for (const row of res.rows) {
            df.set(row.key, row.value);
        }
        return df;
    }

    /**
     * FTS: candidate rows for the given trigrams (non-reduced view query).
     * Each row carries the document's term frequency for that trigram plus the
     * doc-level metadata embedded in the view value, so permission/visibility
     * filtering can be done without loading the documents. See {@link FtsCandidateValue}.
     */
    async ftsTrigramCandidates(trigrams: string[]): Promise<FtsCandidateRow[]> {
        await this.ensureConnected();
        if (!trigrams || trigrams.length === 0) return [];
        const res = await this.db.view("fts-trigram-index", "fts-trigram-index", {
            ...FTS_STALE_READ,
            keys: trigrams,
            reduce: false,
        });
        return res.rows.map((row: any) => ({
            trigram: row.key,
            docId: row.id,
            value: row.value as FtsCandidateValue,
        }));
    }

    /**
     * FTS (aux doctypes): document frequency per trigram for a per-doctype trigram view
     * (e.g. `fts-trigram-index-user`), served by the view's `_count` reduce with `group=true`.
     * Used to keep the rarest (most discriminative) trigrams within the candidate budget.
     */
    async ftsAuxTrigramDf(viewName: string, trigrams: string[]): Promise<Map<string, number>> {
        await this.ensureConnected();
        const df = new Map<string, number>();
        if (!trigrams || trigrams.length === 0) return df;
        const res = await this.db.view(viewName, viewName, {
            ...FTS_STALE_READ,
            keys: trigrams,
            group: true,
            reduce: true,
        });
        for (const row of res.rows) {
            df.set(row.key, row.value);
        }
        return df;
    }

    /**
     * FTS (aux doctypes): candidate rows for the given trigrams from a per-doctype trigram
     * view (non-reduced). Each row carries the named metadata object emitted by the view
     * (see {@link UserFtsMeta} / {@link RedirectFtsMeta}), so permission/filter checks run
     * without loading the documents.
     */
    async ftsAuxTrigramCandidates<M>(
        viewName: string,
        trigrams: string[],
    ): Promise<AuxFtsCandidateRow<M>[]> {
        await this.ensureConnected();
        if (!trigrams || trigrams.length === 0) return [];
        const res = await this.db.view(viewName, viewName, {
            ...FTS_STALE_READ,
            keys: trigrams,
            reduce: false,
        });
        return res.rows.map((row: any) => ({
            trigram: row.key,
            docId: row.id,
            value: row.value as M,
        }));
    }

    /**
     * Get all group documents from database
     */
    async getGroups(): Promise<DbQueryResult> {
        await this.ensureConnected();
        return new Promise((resolve, reject) => {
            const query = {
                selector: {
                    type: "group",
                },
                use_index: "type-index",
                limit: Number.MAX_SAFE_INTEGER,
            };
            this.db
                .find(query)
                .then((res) => {
                    resolve({ docs: res.docs, warnings: res.warning ? [res.warning] : undefined });
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * Get all content documents with a specific parent ID
     * @param parentId - Single or array of parent IDs
     * @returns
     */
    async getContentByParentId(parentId: Uuid | Uuid[]): Promise<DbQueryResult> {
        await this.ensureConnected();
        if (!Array.isArray(parentId)) parentId = [parentId];

        const queryRes = await this.db.view("parentId", "parentId", {
            keys: parentId,
            include_docs: true,
        });

        return {
            docs: queryRes.rows.map((row) => row.doc).filter((doc) => doc.type == DocType.Content),
            warnings: queryRes.warnings,
        } as DbQueryResult;
    }

    /**
     * Get all documents with a specific type
     * @param docType - Type of documents to retrieve
     * @param limit - Maximum number of documents to retrieve (optional)
     * @returns All documents with specified type
     */
    async getDocsByType(
        docType: DocType,
        limit: number = Number.MAX_SAFE_INTEGER,
    ): Promise<DbQueryResult> {
        await this.ensureConnected();
        return new Promise((resolve, reject) => {
            const query = {
                selector: {
                    type: docType,
                },
                limit,
            };
            this.db
                .find(query)
                .then((res) => {
                    resolve({ docs: res.docs, warnings: res.warning ? [res.warning] : undefined });
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * Get all content documents with a specific language
     * @param language - Language ID
     * @param limit - Maximum number of documents to retrieve (optional)
     * @returns
     */
    async getContentByLanguage(
        language: Uuid,
        limit: number = Number.MAX_SAFE_INTEGER,
    ): Promise<DbQueryResult> {
        await this.ensureConnected();
        return new Promise((resolve, reject) => {
            const query = {
                selector: {
                    $and: [
                        {
                            type: DocType.Content,
                        },
                        { language: language },
                    ],
                },
                limit,
            };
            this.db
                .find(query)
                .then((res) => {
                    resolve({ docs: res.docs, warnings: res.warning ? [res.warning] : undefined });
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * Get a user document by userId or email
     * @param email
     * @param userId
     * @returns
     */
    async getUserByIdOrEmail(email: string, userId?: string): Promise<DbQueryResult> {
        await this.ensureConnected();
        const keys = [email];
        if (userId) keys.push(userId);

        const res = await this.db.view("view-user-email-userId", "view-user-email-userId", {
            keys,
            include_docs: true,
        });

        // Merge docs and ensure uniqueness by _id
        const allDocs = res.rows.map((row) => row.doc);
        const uniqueDocsMap = new Map<string, any>();
        allDocs.forEach((doc) => {
            if (doc && doc._id && !uniqueDocsMap.has(doc._id)) {
                uniqueDocsMap.set(doc._id, doc);
            }
        });
        const docs = Array.from(uniqueDocsMap.values());

        return { docs, warnings: res.warnings } as DbQueryResult;
    }

    /**
     * Check if a slug is unique
     * @param slug - Slug to be checked
     * @param documentId - ID of the document to be excluded from the check
     * @returns Promise containing a boolean indicating if the slug is unique
     */
    async checkUniqueSlug(
        slug: string,
        documentId: Uuid,
        docType: DocType = DocType.Content,
    ): Promise<boolean> {
        await this.ensureConnected();
        return new Promise((resolve) => {
            this.db.view("slug", "slug", { key: [docType, slug] }).then((res) => {
                if (res.rows.length > 1) resolve(false);

                // Skip the check if the only result is the document itself
                if (res.rows.length == 1 && res.rows[0].id != documentId) resolve(false);

                resolve(true);
            });
        });
    }

    /**
     * Get all documents of a given type that have a given slug (via the `slug`
     * design-doc view). Unlike {@link checkUniqueSlug} (which returns a boolean), this
     * returns the documents so callers can inspect fields such as `status`.
     */
    async getDocsBySlug(slug: string, docType: DocType): Promise<_baseDto[]> {
        await this.ensureConnected();
        const res = await this.db.view("slug", "slug", {
            key: [docType, slug],
            include_docs: true,
        });
        return res.rows.map((row: any) => row.doc).filter((doc: any) => !!doc) as _baseDto[];
    }

    /**
     * Provides a method to process all documents of given type(s) in the database one at a time.
     * @param docTypes - Array of document types to be included in the query result
     * @param callback - Function to be called for each document
     */
    async processAllDocs(
        docTypes: DocType[],
        callback: (doc: any) => void | Promise<void>,
    ): Promise<any> {
        await this.ensureConnected();
        if (!docTypes.length)
            throw new Error("docTypes must be an array with at least one element");

        let bookmark: string | undefined = undefined;
        let completed = false;
        while (!completed) {
            const query = {
                selector: {
                    type: {
                        ["$in"]: docTypes,
                    },
                },
                limit: 1,
                bookmark,
            };

            if (!bookmark) delete query.bookmark;
            const result = await this.db.find(query);
            bookmark = result.bookmark;
            if (!result.docs.length) completed = true;
            if (result.docs.length > 0) await callback(result.docs[0]);
        }
    }

    /**
     * Get the database schema version
     */
    async getSchemaVersion(): Promise<number> {
        await this.ensureConnected();
        return new Promise((resolve, reject) => {
            this.db
                .get("dbSchema")
                .then((res) => {
                    resolve(res.version);
                })
                .catch((err) => {
                    if (err.reason == "missing") {
                        resolve(0);
                    } else {
                        reject(err);
                    }
                });
        });
    }

    /**
     * Set the database schema version. This should only be used by upgrade scripts.
     */
    setSchemaVersion(version: number): Promise<DbUpsertResult> {
        return new Promise((resolve, reject) => {
            this.upsertDoc({
                _id: "dbSchema",
                version: version,
            })
                .then((res) => {
                    resolve(res);
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }

    /**
     * Generate a diff between two documents
     * @param doc1
     * @param doc2
     * @returns
     */
    calculateDiff(doc1: any, doc2: any) {
        return Object.keys(doc1).reduce((acc: any, key) => {
            if (doc1[key] !== doc2[key]) {
                acc[key] = doc1[key];
            }

            // Always include _id and type
            acc._id = doc1._id;
            acc.type = doc1.type;

            // Include parentId if it exists
            if (doc1.parentId) {
                acc.parentId = doc1.parentId;
            }

            return acc;
        }, {});
    }
}
