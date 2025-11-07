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
import { RedirectDto } from "../dto/RedirectDto";
import { calcGroups, type SearchOptions } from "./db.searchFunctions";

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
 * Database service for interacting with CouchDB.
 * Provides methods for CRUD operations, document synchronization, and query execution.
 *
 * @extends EventEmitter
 *
 * @fires DbService#update - Emitted when any valid document with a type field is updated in the database
 * @fires DbService#groupUpdate - Emitted when a group document is updated, used by the permission system to update access maps
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

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private configService: ConfigService,
    ) {
        super();
        const dbConfig = this.configService.get<DatabaseConfig>("database");
        const syncConfig = this.configService.get<SyncConfig>("sync");

        this.connect(dbConfig);
        this.syncTolerance = syncConfig.tolerance;
    }

    /**
     * Connect to the database
     */
    private connect(dbConfig: DatabaseConfig) {
        this.db = nano({
            url: dbConfig.connectionString,
            requestDefaults: {
                agent: new http.Agent({
                    maxSockets: dbConfig.maxSockets,
                }),
            },
        }).use(dbConfig.database);

        this.logger.info("Connected to database");

        // Subscribe to database changes feed
        this.db.changesReader
            .start({ includeDocs: true })
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

                    // Emit delete commands for language documents
                    else if (update.doc.type === DocType.DeleteCmd) {
                        const doc = update.doc as DeleteCmdDto;
                        if (doc.deleteReason === DeleteReason.Deleted)
                            this.emit("languageUpdate", doc);
                    }
                }
            })
            .on("error", (err) => {
                // The changes reader stops on error, so it should be restarted.
                // At this point clients will get out of sync, so it will be better to restart the server.
                this.logger.error("Database changes feed error", err);
                throw err;
            });
    }

    /**
     * Insert a document into the database. This should only be used for new documents with unique IDs.
     * @param {any} doc - Document to be inserted
     * @returns - Promise containing the insert result
     */
    insertDoc(doc: any): Promise<DbUpsertResult> {
        return new Promise((resolve, reject) => {
            this.db
                .insert(doc)
                .then((insertResult) => {
                    resolve({
                        id: insertResult.id,
                        ok: insertResult.ok,
                        rev: insertResult.rev,
                    });
                })
                .catch((err) => {
                    reject(err);
                });
        });
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

        if (doc.type === DocType.Group && doc.type === DocType.User) {
            throw new Error(`Delete command is not implemented for ${doc.type} documents`);
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
            // Delete command is not valid for group or user documents, as they are not synced to clients
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

            // Generate delete command if the document's status has changed to draft
            if (
                existing &&
                doc.type === DocType.Content &&
                (existing as ContentDto).status === PublishStatus.Published &&
                (doc as ContentDto).status === PublishStatus.Draft
            ) {
                await this.insertDeleteCmd({
                    reason: DeleteReason.StatusChange,
                    doc: doc as ContentDto,
                    prevDoc: existing as _contentBaseDto,
                });
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
        try {
            const insertResult = await this.insertDoc(docPlain);
            insertResult.updatedTimeUtc = docPlain.updatedTimeUtc;
            insertResult.changes = changes;
            return insertResult;
        } catch (err) {
            if (err.reason == "Document update conflict.") {
                // This error can happen when a document is updated near-simultaneously by another process, i.e.
                // after the revision has been returned to this process but before this process could write the
                // change to the database. To resolve this, just try again to get the updated revision ID and update
                // the document.

                // TODO: We should probably have a retry counter here to prevent the code from retrying endlessly.
                delete docPlain._rev;
                return await this.upsertDoc(docPlain);
            } else {
                throw new Error(err);
            }
        }
    }

    /**
     * Get a single document by ID
     * @param id - document ID (_id field)
     */
    getDoc(docId: string): Promise<DbQueryResult> {
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
    getDocs(docIds: Uuid[], types: DocType[]): Promise<DbQueryResult> {
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

        if (options.doc.type === DocType.Group) {
            throw new Error(
                "Permission change delete command is not valid for group documents, as they are not synced to clients",
            );
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
    getLatestDocUpdatedTime(): Promise<number> {
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
        const res: DbQueryResult = await this.db.find(query);

        // calculate the start and end of the block, used to pass back to the client for pagination
        const { blockStart, blockEnd } = this.calcBlockStartEnd(res.docs);

        res.blockStart = blockStart;
        res.blockEnd = blockEnd;
        return res;
    }

    /**
     * Configurable database search function
     * @param {SearchOptions} options - Search options.
     * @returns - Promise containing a DbQueryResult object
     */
    search(options: SearchOptions): Promise<DbQueryResult> {
        if (options.slug) return this.searchBySlug(options);
        if (options.parentId) return this.getContentByParentId(options.parentId);

        // TODO: move queries to separate functions similar to searchBySlug
        return new Promise(async (resolve, reject) => {
            // Construct time selectors
            const selectors = [];
            if (options.from) {
                selectors.push({
                    updatedTimeUtc: {
                        $gte: options.from - this.syncTolerance,
                    },
                });
            }

            if (options.to) {
                selectors.push({
                    updatedTimeUtc: {
                        $lte: options.to + this.syncTolerance,
                    },
                });
            }

            const timeSelector = [];
            if (selectors.length > 0) {
                timeSelector.push({
                    $and: selectors,
                });
            }

            const docIdSelector = options.docId ? [{ _id: options.docId }] : [];

            const languageSelector =
                options.languages?.length > 0 ? [{ language: { $in: options.languages } }] : [];

            const docQuery = {
                selector: { $and: [...timeSelector, ...docIdSelector] },
                limit: options.limit || Number.MAX_SAFE_INTEGER,
                sort: options.sort || [{ updatedTimeUtc: "desc" }],
            };

            const $or = [];
            Object.values(options.types).forEach((docType: DocType) => {
                // only allow user to access the document type if it is included the users userAccess object
                if (!options.userAccess[docType]) return;

                // reduce user requested groups to only the groups the user has access to
                // default groups to user access groups if not provided
                const groups = calcGroups(docType, options);

                if (docType !== DocType.Group && !options.contentOnly)
                    $or.push({
                        $and: [{ type: { $in: [docType] } }, { memberOf: { $in: groups } }],
                    });

                // content only docs
                if (docType === DocType.Post || docType === DocType.Tag)
                    if (options.contentOnly)
                        $or.push({
                            $and: [
                                { type: { $in: [DocType.Content] } },
                                { memberOf: { $in: groups } },
                                { parentType: docType },
                                { status: PublishStatus.Published },
                                {
                                    $or: [
                                        { expiryDate: { $gt: Date.now() } },
                                        { expiryDate: { $exists: false } },
                                    ],
                                },
                                ...languageSelector,
                            ],
                        });
                    else
                        $or.push({
                            $and: [
                                { type: { $in: [DocType.Content] } },
                                { memberOf: { $in: groups } },
                                { parentType: docType },
                                ...languageSelector,
                            ],
                        });

                // groups docs
                if (docType === DocType.Group && !options.contentOnly) {
                    $or.push({
                        $and: [
                            { type: DocType.Group },
                            { _id: { $in: options.userAccess[DocType.Group] } },
                        ],
                    });
                }
            });

            if ($or.length < 1)
                resolve({
                    docs: [],
                    warnings: ["User does not have access to view any documents"],
                });
            docQuery.selector["$and"].push({ $or });

            this.executeFindQuery(docQuery)
                .then((res) => resolve(res))
                .catch((err) => reject(err));
        });
    }

    /**
     * Perform a database search by slug
     * @param options {SearchOptions} - Search options.
     * @returns - Promise containing a DbQueryResult object
     */
    async searchBySlug(options: SearchOptions): Promise<DbQueryResult> {
        const docQuery = {
            selector: { slug: options.slug },
            limit: Number.MAX_SAFE_INTEGER,
        } as nano.MangoQuery;

        const res = await this.executeFindQuery(docQuery);

        // validate the result against the user access
        res.docs = res.docs.filter((doc: ContentDto | RedirectDto) => {
            if (
                doc.type == DocType.Content &&
                options.userAccess[(doc as ContentDto).parentType] &&
                doc.memberOf.some((m: string) =>
                    (options.userAccess[(doc as ContentDto).parentType] as string[]).includes(m),
                )
            ) {
                return true;
            }

            if (
                doc.type == DocType.Redirect &&
                options.userAccess[doc.type] &&
                doc.memberOf.some((m: string) =>
                    (options.userAccess[doc.type] as string[]).includes(m),
                )
            ) {
                return true;
            }
            return false;
        });

        // sort the result by updatedTimeUtc in descending order
        res.docs.sort((a: ContentDto | RedirectDto, b: ContentDto | RedirectDto) => {
            return b.updatedTimeUtc - a.updatedTimeUtc;
        });

        // Check if a redirect document is found, and return the first match. Else, return the first content document.
        const redirects = res.docs.filter(
            (doc: ContentDto | RedirectDto) => doc.type == DocType.Redirect,
        ) as RedirectDto[];

        if (redirects.length > 0) {
            res.docs = [redirects[0]];
        } else {
            res.docs = [res.docs[0]];
        }

        return res;
    }

    /**
     * Get all group documents from database
     */
    getGroups(): Promise<DbQueryResult> {
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
    getDocsByType(
        docType: DocType,
        limit: number = Number.MAX_SAFE_INTEGER,
    ): Promise<DbQueryResult> {
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
    getContentByLanguage(
        language: Uuid,
        limit: number = Number.MAX_SAFE_INTEGER,
    ): Promise<DbQueryResult> {
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
     * Provides a method to process all documents of given type(s) in the database one at a time.
     * @param docTypes - Array of document types to be included in the query result
     * @param callback - Function to be called for each document
     */
    async processAllDocs(
        docTypes: DocType[],
        callback: (doc: any) => void | Promise<void>,
    ): Promise<any> {
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
    getSchemaVersion(): Promise<number> {
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
