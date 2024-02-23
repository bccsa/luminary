import { Injectable } from "@nestjs/common";
import * as nano from "nano";
import { isDeepStrictEqual } from "util";
import { DocType, Uuid } from "../enums";
import { ConfigService } from "@nestjs/config";
import { DatabaseConfig, SyncConfig } from "../configuration";
import * as http from "http";

/**
 * @typedef {Object} - getDocsOptions
 * @property {Array<Uuid>} groups - Array with IDs of groups for which member documents should be returned.
 * Note: If the "group" type is included in getDocsOptions.types, the group itself will be included in the result.
 * @property {Array<DocType>} types - Array of document types to be included in the query result
 * @property {number} from - Include documents with an updateTimeUtc timestamp greater or equal to the passed value. (Default 0)
 */
export type GetDocsOptions = {
    groups: Array<Uuid>;
    types: Array<DocType>;
    from?: number;
};

/**
 * Standardized format for database query results
 */
export type DbQueryResult = {
    docs: Array<any>;
    warnings?: Array<string>;
};

@Injectable()
export class DbService {
    private db: nano.DocumentScope<unknown>;
    protected syncVersion: number;
    protected syncTolerance: number;

    constructor(private configService: ConfigService) {
        const dbConfig = this.configService.get<DatabaseConfig>("database");
        const syncConfig = this.configService.get<SyncConfig>("sync");

        this.connect(dbConfig.connectionString, dbConfig.database);
        this.syncTolerance = syncConfig.tolerance;
    }

    /**
     * Connect to the database
     * @param {string} connectionString - CouchDB URL including username and password (http://user:password@hostname_or_ip)
     * @param {string} database - Database name.
     */
    private connect(connectionString: string, database: string) {
        this.db = nano({
            url: connectionString,
            requestDefaults: {
                agent: new http.Agent({
                    maxSockets: 512,
                }),
            },
        }).use(database);
    }

    /**
     * Insert or update a document with given ID.
     * @param doc - CouchDB document with an _id field
     */
    upsertDoc(doc: any) {
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
                        this.db
                            .insert(doc)
                            .then((insertResult) => {
                                resolve(insertResult);
                            })
                            .catch((err) => {
                                reject(err);
                            });
                    } else if (existing && isDeepStrictEqual(doc, existing)) {
                        // Document in DB is the same as passed doc: do nothing
                        resolve("passed document equal to existing database document");
                    } else if (existing) {
                        // Passed document is differnt than document in DB: update
                        doc._rev = rev;
                        doc.updatedTimeUtc = Date.now();

                        this.db
                            .insert(doc)
                            .then((insertResult) => {
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
     * Get the parent Post or Tag document for the passed Content document ID.
     * @param docId - Content document ID
     * @returns
     */
    getParentDoc(docId: Uuid): Promise<any> {
        return new Promise((resolve) => {
            return this.db
                .view("content", "contentParent", {
                    key: docId,
                    include_docs: true,
                    limit: 1,
                })
                .then((res) => {
                    if (res.rows && res.rows[0] && res.rows[0].doc) {
                        resolve(res.rows[0].doc);
                    } else {
                        resolve(undefined);
                    }
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
     * Gets the update time of the oldest change document.
     */
    getOldestChangeTime(): Promise<number> {
        return new Promise((resolve) => {
            this.db
                .view("sync", "changeUpdatedTimeUtc", {
                    limit: 1,
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
     * Function used to clear a database
     */
    async destroyAllDocs() {
        const res = await this.db.list();
        const pList = [];
        res.rows.forEach((doc) => {
            pList.push(this.db.destroy(doc.id, doc.value.rev));
        });

        await Promise.all(pList);
    }

    /**
     * Get data to which a user has access to including the user document itself.
     * @param {string} userID - User document ID.
     * @param {GetDocsOptions} options - Query configuration object.
     * @returns - Promise containing the query result
     */
    getDocsPerGroup(userId: string, options: GetDocsOptions): Promise<DbQueryResult> {
        // Set default options
        if (!options.from) options.from = 0;

        return new Promise((resolve, reject) => {
            // To allow effective indexing, the structure inside an "$or" selector should be identical for all the sub-selectors
            // within the "$or". Because of this restriction, it is necessary to do multiple queries and join the result externally

            const pList = [];

            const query_memberOf_per_type = {
                // TODO: The order of fields can possibly improve indexing effectiveness, as well as using
                // different queries for the full time range vs a partial time range. We need a bigger data set / production data to test this.
                selector: {
                    $and: [
                        {
                            updatedTimeUtc: {
                                $gte: options.from,
                            },
                        },
                        {
                            type: {
                                $in: options.types,
                            },
                        },
                        {
                            memberOf: {
                                $in: options.groups,
                            },
                        },
                    ],
                },
                use_index: "updatedTimeUtc-type-memberOf-index",
            };
            pList.push(this.db.find(query_memberOf_per_type));

            // Include the (group) document itself if the "group" type is included in the options
            if (options.types.includes(DocType.Group)) {
                // Use two different queries to allow for effective indexing
                let query_groupDoc;
                if (options.from === 0) {
                    query_groupDoc = {
                        selector: {
                            $and: [
                                {
                                    type: DocType.Group,
                                },
                                {
                                    _id: {
                                        $in: options.groups,
                                    },
                                },
                            ],
                        },
                        use_index: "type-id-index",
                    };
                } else {
                    query_groupDoc = {
                        selector: {
                            $and: [
                                {
                                    updatedTimeUtc: {
                                        $gte: options.from,
                                    },
                                },
                                {
                                    type: DocType.Group,
                                },

                                {
                                    _id: {
                                        $in: options.groups,
                                    },
                                },
                            ],
                        },
                        use_index: "updatedTimeUtc-type-id-index",
                    };
                }

                pList.push(this.db.find(query_groupDoc));
            }

            // Include the user document
            if (userId) {
                pList.push(this.getDoc(userId));
            }

            Promise.all(pList)
                .then((res) => {
                    const docs = res.flatMap((r) => r.docs);
                    const warnings = res.flatMap((r) => r.warning).filter((w) => w);
                    resolve({ docs, warnings: warnings.length > 0 ? warnings : undefined });
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
}
