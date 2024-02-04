import { Injectable } from "@nestjs/common";
import * as nano from "nano";

/**
 * @typedef {Object} - getDocsOptions
 * @property {Array<string>} groups - Array with IDs of groups for which member documents should be returned.
 * Note: If the "group" type is included in getDocsOptions.types, the group itself will be included in the result.
 * @property {Array<string>} types - Array of document types to be included in the query result
 * @property {number} from - Include documents with an updateTimeUtc timestamp greater or equal to the passed value. (Default 0)
 */
export type getDocsOptions = {
    groups: Array<string>;
    types: Array<string>;
    from?: number;
};

enum AclPermission {
    View = "view",
    Assign = "assign",
    Edit = "edit",
    Translate = "translate",
    Publish = "publish",
    Delete = "delete",
}

type AclEntry = {
    type: DocType;
    groupId: string;
    permission: Array<AclPermission>;
};

type AclMapEntry = {
    ref: Group;
    types: Map<DocType, Map<AclPermission, boolean>>;
};

enum DocType {
    Post = "post",
    Content = "content",
    Tag = "tag",
    Image = "image",
    Video = "video",
    Audio = "Audio",
    MediaDownload = "mediaDownload",
    User = "user",
    Language = "lang",
    Change = "change",
    Group = "group",
}

/**
 * Permission system Group class
 */
class Group {
    private _typePermissionGroupMap = new Map<
        DocType,
        Map<AclPermission, Map<string, Map<string, boolean>>>
    >();
    private _groupTypePermissionMap = new Map<string, Map<DocType, Map<AclPermission, boolean>>>();
    private _aclMap = new Map<string, AclMapEntry>();
    private _childGroups = new Map<string, Group>();
    private _id: string;

    private constructor(id: string) {
        this._id = id;
    }

    /**
     * Database document ID of the group document
     */
    public get id(): string {
        return this._id;
    }

    /**
     * Create or update groups from passed array of group database documents in passed groupMap
     * @param groupDocs
     * @param groupMap
     */
    static updateGroups(groupDocs: Array<any>, groupMap: Map<string, Group>) {
        while (groupDocs.length > 0) {
            this.updateGroup(groupDocs.splice(0, 1)[0], groupDocs, groupMap);
        }
    }

    // Create or update single group
    private static updateGroup(
        doc: any,
        groupDocs: Array<any>,
        groupMap: Map<string, Group>,
    ): Group {
        let g: Group;
        // Check if group is already in groupList
        if (groupMap[doc._id]) {
            g = groupMap[doc._id];
        } else {
            g = new Group(doc._id);
            groupMap[doc._id] = g;
        }

        doc.acl.forEach((aclEntry: AclEntry) => {
            let parent: Group = groupMap[aclEntry.groupId];

            // Create parent group if not existing
            if (!parent) {
                // find doc
                const i = groupDocs.findIndex((t) => t._id === aclEntry.groupId);
                if (i >= 0) {
                    const d = groupDocs.splice(i, 1)[0];
                    if (d) {
                        parent = this.updateGroup(d, groupDocs, groupMap);
                    }
                }
            }

            // If the parent now exists, add or update ACL's to this group
            if (parent) {
                g.updateAcl(parent, aclEntry.type, aclEntry.permission);
            }
        });

        return g;
    }

    /**
     * Remove groups as per passed array of group IDs in the passed groupMap
     * @param groupDocs
     * @param groupMap
     */
    static removeGroups(groupIds: Array<string>, groupMap: Map<string, Group>) {
        while (groupIds.length > 0) {
            this.removeGroup(groupIds.splice(0, 1)[0], groupMap);
        }
    }

    // Remove single group
    private static removeGroup(docId: string, groupMap: Map<string, Group>) {
        // Find group in groupMap
        const g = groupMap[docId];
        if (g) {
            // Remove from parent maps
            Object.values(g._aclMap).forEach((_acl: AclMapEntry) => {
                Object.keys(_acl.types).forEach((_type: DocType) => {
                    Object.keys(_acl.types[_type]).forEach((_permission: AclPermission) => {
                        _acl.ref.removeMap(docId, g.id, _type, _permission);
                    });
                });
            });

            // Remove ACL in referenced documents
            Object.values(g._childGroups).forEach((group: Group) => {
                if (group._aclMap[g.id]) {
                    delete group._aclMap[g.id];
                }
            });

            // Delete from groupMap
            delete groupMap[docId];
        }
    }

    // Add or update acl to Group object
    private updateAcl(parentGroup: Group, type: DocType, permissions: Array<AclPermission>) {
        // Add group to map
        if (!this._aclMap[parentGroup.id]) {
            this._aclMap[parentGroup.id] = {
                ref: parentGroup,
                types: {},
            };
        }

        // Store reference to this group in parent group to facilitate automatic ACL removal
        // when the parent group is deleted
        if (!parentGroup._childGroups[this.id]) {
            parentGroup._childGroups[this.id] = this;
        }

        // Add docType to map
        if (!this._aclMap[parentGroup.id].types[type]) {
            this._aclMap[parentGroup.id].types[type] = {};
        }

        // Remove revoked permissions from aclMap
        Object.keys(this._aclMap[parentGroup.id].types[type]).forEach((p: AclPermission) => {
            if (!permissions.includes(p)) {
                delete this._aclMap[parentGroup.id].types[type][p];

                // Update parent accessMap
                parentGroup.removeMap(this.id, this.id, type, p);
            }
        });

        // Add new permissions to aclMap
        permissions.forEach((p) => {
            if (!this._aclMap[parentGroup.id].types[type][p]) {
                this._aclMap[parentGroup.id].types[type][p] = true;

                // Update parent accessMap
                parentGroup.addMap(this.id, this.id, type, p);
            }
        });

        // Cleanup
        if (Object.keys(this._aclMap[parentGroup.id].types[type]).length == 0) {
            delete this._aclMap[parentGroup.id].types[type];
        }

        if (Object.keys(this._aclMap[parentGroup.id]).length == 0) {
            delete this._aclMap[parentGroup.id];

            // remove reference from parent
            delete parentGroup._childGroups[this.id];
        }
    }

    private addMap(
        childGroupId: string,
        requesterGroupId: string,
        type: DocType,
        permission: AclPermission,
    ) {
        // Build Group Type Permission map
        if (!this._groupTypePermissionMap[childGroupId]) {
            this._groupTypePermissionMap[childGroupId] = {};
        }

        if (!this._groupTypePermissionMap[childGroupId][type]) {
            this._groupTypePermissionMap[childGroupId][type] = {};
        }

        if (!this._groupTypePermissionMap[childGroupId][type][permission]) {
            this._groupTypePermissionMap[childGroupId][type][permission] = true;
        }

        // Build Type Permisson Group map
        if (!this._typePermissionGroupMap[type]) {
            this._typePermissionGroupMap[type] = {};
        }

        if (!this._typePermissionGroupMap[type][permission]) {
            this._typePermissionGroupMap[type][permission] = {};
        }

        if (!this._typePermissionGroupMap[type][permission][childGroupId]) {
            this._typePermissionGroupMap[type][permission][childGroupId] = {};
        }

        if (!this._typePermissionGroupMap[type][permission][childGroupId][requesterGroupId]) {
            this._typePermissionGroupMap[type][permission][childGroupId][requesterGroupId] = true;
            // The requesterGroupId is used to keep track of which path the inherited permission is passed. This is needed to
            // be able to reliably remove permissions in multi-path hierarchies. The group passing an ACL map to an upstream group
            // will be the requestor.

            // Pass child to grandparent with the parent group's access. This means:
            // - If the grandparent has more access to the parent, this access will also apply to the grandparent's access to the child.
            // - If the grandparent has less access to the parent, this access will also apply to the grandparent's access to the child.

            Object.values(this._aclMap)
                // Iterate through acls
                .forEach((acl: AclMapEntry) => {
                    //Iterate through docTypes
                    Object.keys(acl.types).forEach((_type: DocType) => {
                        // Iterate through permissions
                        Object.keys(acl.types[_type]).forEach((_permission: AclPermission) => {
                            acl.ref.addMap(childGroupId, this.id, _type, _permission);
                        });
                    });
                });
        }
    }

    private removeMap(
        childGroupId: string,
        requestorGroupId: string,
        type: DocType,
        permission: AclPermission,
    ) {
        // Remove from Type Permission Group map
        if (
            this._typePermissionGroupMap[type] &&
            this._typePermissionGroupMap[type][permission] &&
            this._typePermissionGroupMap[type][permission][childGroupId] &&
            this._typePermissionGroupMap[type][permission][childGroupId][requestorGroupId]
        ) {
            delete this._typePermissionGroupMap[type][permission][childGroupId][requestorGroupId];
        }

        if (
            this._typePermissionGroupMap[type] &&
            this._typePermissionGroupMap[type][permission] &&
            this._typePermissionGroupMap[type][permission][childGroupId]
        ) {
            const requestorIds = Object.keys(
                this._typePermissionGroupMap[type][permission][childGroupId],
            );
            // We need to remove self-induced permissions if all external requestors have been removed
            if (
                requestorIds.length == 0 ||
                (requestorIds.length == 1 && requestorIds[0] === this.id)
            ) {
                delete this._typePermissionGroupMap[type][permission][childGroupId];

                // As there is no permissions left, remove any permissions from parents that has been requested from this group
                Object.values(this._aclMap).forEach((_acl: AclMapEntry) => {
                    Object.keys(_acl.types).forEach((_type: DocType) => {
                        Object.keys(_acl.types[_type]).forEach((_permission: AclPermission) => {
                            _acl.ref.removeMap(childGroupId, this.id, _type, _permission);
                        });
                    });
                });
            }
        }

        if (
            this._typePermissionGroupMap[type][permission] &&
            Object.keys(this._typePermissionGroupMap[type][permission]).length == 0
        ) {
            delete this._typePermissionGroupMap[type][permission];
        }

        if (
            this._typePermissionGroupMap[type] &&
            Object.keys(this._typePermissionGroupMap[type]).length == 0
        ) {
            delete this._typePermissionGroupMap[type];
        }

        // Remove from Group Type Permission map
        if (
            this._groupTypePermissionMap[childGroupId] &&
            this._groupTypePermissionMap[childGroupId][type] &&
            this._groupTypePermissionMap[childGroupId][type][permission]
        ) {
            delete this._groupTypePermissionMap[childGroupId][type][permission];
        }

        if (
            this._groupTypePermissionMap[childGroupId] &&
            this._groupTypePermissionMap[childGroupId][type] &&
            Object.keys(this._groupTypePermissionMap[childGroupId][type]).length == 0
        ) {
            delete this._groupTypePermissionMap[childGroupId][type];
        }

        if (
            this._groupTypePermissionMap[childGroupId] &&
            Object.keys(this._groupTypePermissionMap[childGroupId]).length == 0
        ) {
            delete this._groupTypePermissionMap[childGroupId];
        }
    }
}

@Injectable()
export class DbService {
    private db: nano.DocumentScope<unknown>;
    protected syncVersion: number;
    protected syncTolerance: number;
    private groupMap: Map<string, Group>;

    constructor() {
        this.connect(process.env.DB_CONNECTION_STRING as string, process.env.DB_DATABASE as string);
        this.syncTolerance = Number.parseInt((process.env.SYNC_TOLERANCE as string) || "1000");
        this.groupMap = new Map<string, Group>();

        this.getDocs("", {
            groups: [
                "group-private-content",
                "group-private-editors",
                "group-private-users",
                "group-super-admins",
                "group-public-users",
                "group-public-content",
                "group-public-editors",
            ],
            types: ["group"],
        }).then((res: any) => {
            Group.updateGroups(res.docs, this.groupMap);

            Group.updateGroups(
                [
                    {
                        _id: "group-public-content",
                        type: "group",
                        updatedTimeUtc: 3,
                        name: "Public Content",
                        acl: [
                            {
                                type: "post",
                                groupId: "group-super-admins",
                                permission: ["view"],
                            },
                            {
                                type: "tag",
                                groupId: "group-public-users",
                                permission: ["view", "tag"],
                            },
                            {
                                type: "post",
                                groupId: "group-public-editors",
                                permission: ["view", "edit", "translate"],
                            },
                            {
                                type: "tag",
                                groupId: "group-public-editors",
                                permission: ["view", "translate", "assign"],
                            },
                            {
                                type: "group",
                                groupId: "group-public-editors",
                                permission: ["view", "assign"],
                            },
                        ],
                    },
                ],
                this.groupMap,
            );

            // Group.removeGroups(["group-public-users"], this.groupMap);
            // Group.removeGroups(["group-super-admins"], this.groupMap);
        });
    }

    /**
     * Connect to the database
     * @param {string} connectionString - CouchDB URL including username and password (http://user:password@hostname_or_ip)
     * @param {string} database - Database name.
     */
    private connect(connectionString: string, database: string) {
        this.db = nano(connectionString).use(database);
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
            this.db
                .get(doc._id)
                .then(async (existing) => {
                    // TODO: Only update document if document has changed
                    doc._rev = existing._rev;
                    resolve(await this.db.insert(doc));
                })
                // Create new doc if it does not exit
                .catch(async () => {
                    resolve(await this.db.insert(doc));
                });
        });
    }

    /**
     * Get a document by ID
     * @param id - document ID (_id field)
     */
    getDoc(id: string) {
        return this.db.get(id);
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
     * @param {getDocsOptions} options - Query configuration object.
     * @returns - Promise containing the query result
     */
    getDocs(userId: string, options: getDocsOptions): Promise<unknown> {
        // Set default options
        if (!options.from) options.from = 0;

        const query = {
            selector: {
                $or: [
                    {
                        _id: userId,
                    },
                    {
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
                                $or: [
                                    {
                                        // Include documents who are a member of any of the passed groups
                                        memberOf: {
                                            $in: options.groups,
                                        },
                                    },
                                    {
                                        // Include the (group) document itself
                                        _id: {
                                            $in: options.groups,
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        };
        return this.db.find(query);
    }

    // /**
    //  * Get all directly and indirectly related (child) tag ID's
    //  * @param {Array} tagIDs - Array of tag ID's
    //  * @returns - Promise containing an array of related tag ID's (i.e. which directly or indirectly has been tagged with one of the passed tag ID's). The passed tag ID's are also included in the result.
    //  */
    // getRelatedTags(tagIDs) {
    //     return new Promise((resolve) => {
    //         const res = [];
    //         const pList = [];
    //         res.push(...tagIDs);

    //         this.db.view("tag", "tagChildRelation", { keys: tagIDs }).then((q) => {
    //             if (q.rows) {
    //                 // Iterate through children
    //                 q.rows.forEach((row) => {
    //                     pList.push(
    //                         this.getRelatedTags([row.id]).then((r: Array<string>) => {
    //                             res.push(...r);
    //                         }),
    //                     );
    //                 });

    //                 Promise.all(pList).then(() => {
    //                     // Get unique values. This might not be the most efficient way.
    //                     // It might be better to do a unique after the full iterative lookup is done.
    //                     const unique = res.filter((value, index, array) => {
    //                         return array.indexOf(value) === index;
    //                     });
    //                     resolve(unique);
    //                 });
    //             }
    //         });
    //     });
    // }

    // getExpandedGroups(groups: Array<string>) {
    //     return new Promise((resolve) => {
    //         const res = [];
    //         const pList = [];
    //         res.push(...groups);
    //     });
    // }
}
