import { Injectable, Inject } from "@nestjs/common";
import * as nano from "nano";
import { isDeepStrictEqual } from "util";
import { DocType, Uuid } from "../enums";
import { ConfigService } from "@nestjs/config";
import { DatabaseConfig, SyncConfig } from "../configuration";
import * as http from "http";
import { EventEmitter } from "stream";
import { instanceToPlain } from "class-transformer";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";

/**
 * @typedef {Object} - getDocsOptions
 * @property {Array<Uuid>} groups - Array with IDs of groups for which member documents should be returned.
 * Note: If the "group" type is included in getDocsOptions.types, the group itself will be included in the result.
 * @property {Array<DocType>} types - Array of document types to be included in the query result
 * @property {number} from - Include documents with an updateTimeUtc timestamp greater or equal to the passed value. (Default 0)
 */
export type GetDocsOptions = {
    userAccess: Map<DocType, Uuid[]>; // Map of document types and the user's access to them
    from?: number;
    to?: number;
};

/**
 * Standardized format for database query results
 * @param {Array<any>} docs - Array of databased returned documents
 * @param {Array<string>} warnings - Array of warnings
 * @param {number} version - Timestamp of the latest document update
 */
export type DbQueryResult = {
    docs: Array<any>;
    warnings?: Array<string>;
    version?: number;
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

@Injectable()
export class DbService extends EventEmitter {
    private db: any;
    protected syncVersion: number;
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
    upsertDoc(doc: any): Promise<DbUpsertResult> {
        return new Promise((resolve, reject) => {
            if (!doc._id) {
                reject("Invalid document: The passed document does not have an '_id' property");
            }
            this.getDoc(doc._id)
                .then((res) => {
                    let existing; // if no existing document, this will be undefined
                    if (res.docs && res.docs.length > 0) {
                        existing = res.docs[0];
                    }

                    // Check that the document type is not changed
                    if (existing && existing.type !== doc.type) {
                        reject(
                            `Document type change not allowed. Existing type: ${existing.type}, New type: ${doc.type}`,
                        );
                    }

                    let rev: string;

                    // Remove updatedTimeUtc if passed from client
                    delete doc.updatedTimeUtc;

                    // Remove revision and updateTimeUtc from existing doc from database for comparison purposes
                    if (existing) {
                        rev = existing._rev as string;
                        delete existing._rev;
                        delete existing.updatedTimeUtc;
                    }

                    if (!existing) {
                        // Passed document does not exist in database: create
                        doc.updatedTimeUtc = Date.now();
                        this.insertDoc(doc)
                            .then((insertResult) => {
                                insertResult.updatedTimeUtc = doc.updatedTimeUtc;
                                insertResult.changes = doc;
                                resolve(insertResult);
                            })
                            .catch((err) => {
                                reject(err);
                            });
                    } else if (existing && isDeepStrictEqual(instanceToPlain(doc), existing)) {
                        // Document in DB is the same as passed doc: do nothing
                        resolve({
                            id: doc._id,
                            ok: true,
                            rev: rev,
                            message: "Document is identical to the one in the database",
                        });
                    } else if (existing) {
                        // Passed document is different than document in DB: update
                        doc._rev = rev;
                        doc.updatedTimeUtc = Date.now();

                        const changes = this.calculateDiff(doc, existing);
                        this.insertDoc(doc)
                            .then((insertResult) => {
                                insertResult.updatedTimeUtc = doc.updatedTimeUtc;
                                insertResult.changes = changes;
                                resolve(insertResult);
                            })
                            .catch((err) => {
                                if (err.reason == "Document update conflict.") {
                                    // This error can happen when a document is updated near-simultaneously by another process, i.e.
                                    // after the revision has been returned to this process but before this process could write the
                                    // change to the database. To resolve this, just try again to get the updated revision ID and update
                                    // the document.

                                    // TODO: We should probably have a retry counter here to prevent the code from retrying endlessly.
                                    delete doc._rev;
                                    this.upsertDoc(doc)
                                        .then((upsertResult) => {
                                            resolve(upsertResult);
                                        })
                                        .catch((err) => {
                                            reject(err);
                                        });
                                } else {
                                    reject(err);
                                }
                            });
                    }
                })
                .catch((err) => {
                    reject(err);
                });
        });
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
                    } else {
                        reject();
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
     * Gets the latest document update time for any documents that has the updatedTimeUtc property
     */
    getLatestDocUpdatedTime(): Promise<number> {
        return new Promise((resolve) => {
            this.db
                .view("sync", "updatedTimeUtc", {
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
     * Get data to which a user has access to including the user document itself.
     * @param {string} userId - User document ID.
     * @param {GetDocsOptions} options - Query configuration object.
     * @returns - Promise containing the query result
     */
    getDocsPerGroup(userId: string, options: GetDocsOptions): Promise<DbQueryResult> {
        return new Promise((resolve, reject) => {
            // To allow effective indexing, the structure inside an "$or" selector should be identical for all the sub-selectors
            // within the "$or". Because of this restriction, it is necessary to do multiple queries and join the result externally

            const pList = [];

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
                        $lt: options.to + this.syncTolerance,
                    },
                });
            }

            const timeSelector = [];
            if (selectors.length > 0) {
                timeSelector.push({
                    $and: selectors,
                });
            } else {
                timeSelector.push(...selectors);
            }

            // Construct queries for each DocType
            Object.keys(options.userAccess).forEach((docType: DocType) => {
                const docQuery = {
                    selector: {
                        $and: [
                            ...timeSelector,
                            {
                                type: docType,
                            },
                            {
                                memberOf: {
                                    $in: options.userAccess[docType],
                                },
                            },
                        ],
                    },
                    limit: Number.MAX_SAFE_INTEGER,
                };
                pList.push(this.db.find(docQuery));

                // Query for associated content documents
                if (docType === DocType.Post || docType === DocType.Tag) {
                    const contentQuery = {
                        selector: {
                            $and: [
                                ...timeSelector,
                                {
                                    type: DocType.Content,
                                },
                                {
                                    memberOf: {
                                        $in: options.userAccess[docType],
                                    },
                                },
                                {
                                    parentType: docType, // TODO: Remove the parentType field if permissions are simplified
                                },
                            ],
                        },
                        limit: Number.MAX_SAFE_INTEGER,
                    };
                    pList.push(this.db.find(contentQuery));
                }
            });

            // Include the (group) document itself if the "group" type is included in the options
            if (options.userAccess[DocType.Group]) {
                const query_groupDoc = {
                    selector: {
                        $and: [
                            ...timeSelector,
                            {
                                type: DocType.Group,
                            },

                            {
                                _id: {
                                    $in: options.userAccess[DocType.Group],
                                },
                            },
                        ],
                    },
                    limit: Number.MAX_SAFE_INTEGER,
                };

                pList.push(this.db.find(query_groupDoc));
            }

            // Include the user document
            if (userId) {
                pList.push(this.getDoc(userId));
            }

            Promise.all(pList)
                .then(async (res) => {
                    const docs = res.flatMap((r) => r.docs);
                    const warnings = res.flatMap((r) => r.warning).filter((w) => w);

                    // Only get the latest version if the "to" parameter is not set
                    let version: number | undefined;
                    if (options.to == undefined) {
                        version = await this.getLatestDocUpdatedTime();
                    }
                    resolve({
                        docs,
                        warnings: warnings.length > 0 ? warnings : undefined,
                        version: version,
                    });
                })
                .catch((err) => {
                    reject(err);
                });
        });
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
                use_index: "type-id-index",
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
     * @param parentId
     * @returns
     */
    getContentByParentId(parentId: Uuid): Promise<DbQueryResult> {
        return new Promise((resolve, reject) => {
            const query = {
                selector: {
                    type: "content",
                    parentId: parentId,
                },
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

    getDocsByType(docType: DocType): Promise<DbQueryResult> {
        return new Promise((resolve, reject) => {
            const query = {
                selector: {
                    type: docType,
                },
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
     * Executes the passed callback on all documents in the database. If the document from the database fails to parse as JSON, the callback will be called with an error object { error: err }.
     */
    processAllDocs(callback: (doc: any) => void): Promise<any> {
        return new Promise((resolve, reject) => {
            const stream = this.db.listAsStream({ include_docs: true });

            stream.on("data", (data) => {
                const lines = data.toString().split("\r\n");
                lines.forEach((line) => {
                    line = line.replace(/,$/, ""); // Remove trailing comma

                    // Check if the line is a valid JSON object
                    if (line && line.length > 0 && line[0] == "{" && line[line.length - 1] == "}") {
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.doc) callback(parsed.doc);
                        } catch (err) {
                            callback({ parseError: err });
                        }
                    }
                });
            });

            stream.on("end", () => {
                resolve(true);
            });

            stream.on("error", (err) => {
                reject(err);
            });
        });
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
