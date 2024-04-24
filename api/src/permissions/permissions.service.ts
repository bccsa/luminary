import { Uuid, DocType, AclPermission } from "../enums";
import { GroupAclEntryDto } from "../dto/GroupAclEntryDto";
import { GroupDto } from "../dto/GroupDto";
import { DbService } from "src/db/db.service";

let dbService: DbService;

/**
 * Acl map entry used internally in Group objects
 */
type AclMapEntry = {
    ref: PermissionSystem;
    types: Map<DocType, Map<AclPermission, boolean>>;
};

/**
 * Access Map used for access calculations
 */
export type AccessMap = Map<Uuid, Map<DocType, Map<AclPermission, boolean>>>;

/**
 * Global Group Map used for permission lookups
 */
const groupMap: Map<Uuid, PermissionSystem> = new Map<Uuid, PermissionSystem>();

/**
 * Represents a permission system that uses a tree structure to organize groups and manage permissions.
 * Each group keeps track of implied permissions and references to parents and children.
 */
export class PermissionSystem {
    // The permission system is a tree structure where each node is representing a group. Each group keeps track of implied permissions and references to parents (through the group's ACLs) and to children (through the childGroup map).
    // The referenced groupMap is a global map of all groups, and is used to look up groups by their ID.
    private _typePermissionGroupRequestorMap = new Map<
        DocType,
        Map<AclPermission, Map<Uuid, Map<Uuid, boolean>>>
    >();
    private _groupTypePermissionMap = new Map<Uuid, Map<DocType, Map<AclPermission, boolean>>>();
    private _aclMap = new Map<Uuid, AclMapEntry>();
    private _childGroups = new Map<Uuid, PermissionSystem>();
    private _id: Uuid;

    private constructor(id: string) {
        this._id = id;
    }

    /**
     * Initialize the permission system
     * @param db - Database service
     */
    static async init(db: DbService) {
        // Prevent initialization if already initialized
        if (dbService) {
            return;
        }

        dbService = db;

        let initialized = false;
        let updateQueue: any[] = [];

        // Read group changes from the database change feed and update the permission system
        dbService.on("groupUpdate", async (update: DocType.Group) => {
            updateQueue.push(update);
            if (initialized) {
                PermissionSystem.upsertGroups(updateQueue);
                updateQueue = [];
            }
        });

        // Add existing groups to permission system
        const dbGroups = await dbService.getGroups();
        this.upsertGroups(dbGroups.docs);

        // Add changes that might have occured while the permission system was being initialized
        this.upsertGroups(updateQueue);
        updateQueue = [];
        initialized = true;
    }

    /**
     * Database document ID of the group document
     */
    public get id(): Uuid {
        return this._id;
    }

    /**
     * Extract an access map for the passed group ID's
     * @param groupIds - Group IDs for which the access map should be extracted
     * @returns - Access Map for the passed group IDs
     */
    static getAccessMap(groupIds: Array<Uuid>): AccessMap {
        let resultMap: AccessMap = new Map<Uuid, Map<DocType, Map<AclPermission, boolean>>>();

        if (groupIds) {
            groupIds.forEach((id: Uuid) => {
                const g = groupMap[id];
                if (!g) return;

                resultMap = { ...resultMap, ...g._groupTypePermissionMap };
            });
        }

        return resultMap;
    }

    /**
     * Compare two access maps and return entries that are not present in the second map
     * @param accessMap1
     * @param accessMap2
     * @returns
     */
    static accessMapDiff(accessMap1: AccessMap, accessMap2: AccessMap) {
        const diff = new Map<Uuid, Map<DocType, Map<AclPermission, boolean>>>();
        if (accessMap1 === undefined || accessMap2 === undefined) return diff;

        Object.keys(accessMap1).forEach((groupId: Uuid) => {
            Object.keys(accessMap1[groupId]).forEach((docType: DocType) => {
                Object.keys(accessMap1[groupId][docType]).forEach((permission: AclPermission) => {
                    if (
                        !accessMap2[groupId] ||
                        !accessMap2[groupId][docType] ||
                        !accessMap2[groupId][docType][permission]
                    ) {
                        if (!diff[groupId]) diff[groupId] = {};
                        if (!diff[groupId][docType]) diff[groupId][docType] = {};
                        diff[groupId][docType][permission] = true;
                    }
                });
            });
        });
        return diff;
    }

    /**
     * Convert an access map to a list of accessible groups per document type for a given permission
     * @param accessMap
     * @param permission
     * @returns
     */
    static accessMapToGroups(
        accessMap: AccessMap,
        permission: AclPermission,
        docTypes: DocType[],
    ): Map<DocType, Uuid[]> {
        const groups = new Map<DocType, Uuid[]>();
        Object.keys(accessMap).forEach((groupId: Uuid) => {
            Object.keys(accessMap[groupId])
                .filter((d: DocType) => docTypes.includes(d))
                .forEach((docType: DocType) => {
                    if (accessMap[groupId][docType][permission]) {
                        if (!groups[docType]) groups[docType] = [];
                        groups[docType].push(groupId);
                    }
                });
        });
        return groups;
    }

    /**
     * Get the accessible groups based on the specified document type, permission, and member groups.
     * @param types - The document types for which access should be verified.
     * @param permission - The permission for which access should be verified.
     * @param memberOfGroups - The array of member groups.
     * @returns An array of accessible group IDs.
     */
    static getAccessibleGroups(
        types: DocType[],
        permission: AclPermission,
        memberOfGroups: Array<Uuid>,
    ): Map<DocType, Uuid[]> {
        const resultMap = new Map<DocType, Uuid[]>();
        memberOfGroups.forEach((memberGroup: Uuid) => {
            const g = groupMap[memberGroup];
            if (!g) return;
            types.forEach((type: DocType) => {
                if (
                    g._typePermissionGroupRequestorMap[type] &&
                    g._typePermissionGroupRequestorMap[type][permission]
                ) {
                    // Add to result map and remove duplicates
                    if (!resultMap[type]) resultMap[type] = [];
                    const unique = new Set([
                        ...resultMap[type],
                        ...Object.keys(g._typePermissionGroupRequestorMap[type][permission]),
                    ]);
                    resultMap[type] = [...unique];
                }
            });
        });
        return resultMap;
    }

    /**
     * Verify access for the passed target group ID
     * @param targetGroups - Group IDs for which user access should be verified for given document type and permission
     * @param type - Document type for which access should be verified
     * @param permission - Permission for which access should be verified
     * @param memberOfGroups - User group membership
     * @param validation - Validation type. "any" = returns true if ANY the user's membership groups has access to ANY of the "targetGroups". "all" = returns true if the ANY of the users membership groups has access to ALL of the "targetGroups". (Default: "any")
     * @returns - True if access is granted, otherwise false
     */
    static verifyAccess(
        targetGroups: Uuid[],
        type: DocType,
        permission: AclPermission,
        memberOfGroups: Array<Uuid>,
        validation: "any" | "all" = "any",
    ) {
        for (const memberGroup of memberOfGroups) {
            let memberGroupValidated = true;
            for (const targetGroup of targetGroups) {
                const g: PermissionSystem = groupMap[memberGroup];
                if (
                    g &&
                    g._groupTypePermissionMap[targetGroup] &&
                    g._groupTypePermissionMap[targetGroup][type] &&
                    g._groupTypePermissionMap[targetGroup][type][permission]
                ) {
                    if (validation === "any") {
                        return true;
                    }
                } else {
                    if (validation === "all") {
                        memberGroupValidated = false;
                    }
                }
            }
            if (validation === "all" && memberGroupValidated) {
                return true;
            }
        }

        return false;
    }

    /**
     * Create or update groups from passed array of group database documents
     * @param groupDocs
     */
    static upsertGroups(groupDocs: Array<any>) {
        while (groupDocs.length > 0) {
            this.updateGroup(groupDocs.splice(0, 1)[0], groupDocs);
        }
    }

    // Create or update single group
    private static updateGroup(doc: GroupDto, groupDocs: Array<GroupDto>): PermissionSystem {
        let g: PermissionSystem;
        // Check if group is already in group map
        if (groupMap[doc._id]) {
            g = groupMap[doc._id];
        } else {
            g = new PermissionSystem(doc._id);
            groupMap[doc._id] = g;
        }

        // Remove ACL's not passed with document
        Object.keys(g._aclMap).forEach((aclGroupId: Uuid) => {
            if (!doc.acl.some((t: GroupAclEntryDto) => t.groupId[aclGroupId])) {
                Object.keys(g._aclMap[aclGroupId].types).forEach((docType: DocType) => {
                    g.upsertAcl(g._aclMap[aclGroupId].ref, docType, []);
                });
            }
        });

        doc.acl.forEach((aclEntry: GroupAclEntryDto) => {
            let parent: PermissionSystem = groupMap[aclEntry.groupId];

            // Create parent group if not existing
            if (!parent) {
                // find doc
                const i = groupDocs.findIndex((t) => t._id === aclEntry.groupId);
                if (i >= 0) {
                    const d = groupDocs.splice(i, 1)[0];
                    if (d) {
                        parent = this.updateGroup(d, groupDocs);
                    }
                }
            }

            // If the parent now exists, add or update ACL's to this group
            if (parent) {
                g.upsertAcl(parent, aclEntry.type, aclEntry.permission);
            }
        });

        return g;
    }

    /**
     * Remove groups as per passed array of group IDs
     * @param groupDocs
     */
    static removeGroups(groupIds: Array<Uuid>) {
        while (groupIds.length > 0) {
            this.removeGroup(groupIds.splice(0, 1)[0]);
        }
    }

    // Remove single group
    private static removeGroup(docId: Uuid) {
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
            Object.values(g._childGroups).forEach((group: PermissionSystem) => {
                if (group._aclMap[g.id]) {
                    delete group._aclMap[g.id];
                }
            });

            // Delete from groupMap
            delete groupMap[docId];
        }
    }

    // Add or update acl to Group object
    private upsertAcl(
        parentGroup: PermissionSystem,
        type: DocType,
        permissions: Array<AclPermission>,
    ) {
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

                // Update parent's map
                parentGroup.removeMap(this.id, this.id, type, p);

                // Remove inherited permissions from parent's map
                Object.keys(this._childGroups).forEach((childGroupId: Uuid) => {
                    parentGroup.removeMap(childGroupId, this.id, type, p);
                });
            }
        });

        // Add new permissions to aclMap
        permissions.forEach((p) => {
            if (!this._aclMap[parentGroup.id].types[type][p]) {
                this._aclMap[parentGroup.id].types[type][p] = true;
                // Why are we setting this to true? The value is not used, and another alternative would have been to use a Set,
                // but this makes the code less consistent so we chose to stick to an old-fasioned object here.

                // Update parent's map
                parentGroup.addMap(this.id, this.id, type, p);

                // Update inherited permissions to parent's map
                Object.keys(this._childGroups).forEach((childGroupId: Uuid) => {
                    parentGroup.addMap(childGroupId, this.id, type, p);
                });
            }
        });

        // Cleanup
        if (Object.keys(this._aclMap[parentGroup.id].types[type]).length == 0) {
            delete this._aclMap[parentGroup.id].types[type];
        }

        if (Object.keys(this._aclMap[parentGroup.id].types).length == 0) {
            delete this._aclMap[parentGroup.id];

            // remove reference from parent
            delete parentGroup._childGroups[this.id];
        }
    }

    private addMap(
        childGroupId: Uuid,
        requesterGroupId: Uuid,
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
            // Why are we setting this to true? The value is not used, and another alternative would have been to use a Set,
            // but this makes the code less consistent so we chose to stick to an old-fasioned object here.
        }

        // Build Type Permisson Group map
        if (!this._typePermissionGroupRequestorMap[type]) {
            this._typePermissionGroupRequestorMap[type] = {};
        }

        if (!this._typePermissionGroupRequestorMap[type][permission]) {
            this._typePermissionGroupRequestorMap[type][permission] = {};
        }

        if (!this._typePermissionGroupRequestorMap[type][permission][childGroupId]) {
            this._typePermissionGroupRequestorMap[type][permission][childGroupId] = {};
        }

        if (
            !this._typePermissionGroupRequestorMap[type][permission][childGroupId][requesterGroupId]
        ) {
            this._typePermissionGroupRequestorMap[type][permission][childGroupId][
                requesterGroupId
            ] = true;
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
        childGroupId: Uuid,
        requestorGroupId: Uuid,
        type: DocType,
        permission: AclPermission,
    ) {
        // Remove from Type Permission Group map
        if (
            this._typePermissionGroupRequestorMap[type] &&
            this._typePermissionGroupRequestorMap[type][permission] &&
            this._typePermissionGroupRequestorMap[type][permission][childGroupId] &&
            this._typePermissionGroupRequestorMap[type][permission][childGroupId][requestorGroupId]
        ) {
            delete this._typePermissionGroupRequestorMap[type][permission][childGroupId][
                requestorGroupId
            ];
        }

        if (
            this._typePermissionGroupRequestorMap[type] &&
            this._typePermissionGroupRequestorMap[type][permission] &&
            this._typePermissionGroupRequestorMap[type][permission][childGroupId]
        ) {
            const requestorIds = Object.keys(
                this._typePermissionGroupRequestorMap[type][permission][childGroupId],
            );
            // We need to remove self-induced permissions if all external requestors have been removed
            if (
                requestorIds.length == 0 ||
                (requestorIds.length == 1 && requestorIds[0] === this.id)
            ) {
                delete this._typePermissionGroupRequestorMap[type][permission][childGroupId];

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
            this._typePermissionGroupRequestorMap[type] &&
            this._typePermissionGroupRequestorMap[type][permission] &&
            Object.keys(this._typePermissionGroupRequestorMap[type][permission]).length == 0
        ) {
            delete this._typePermissionGroupRequestorMap[type][permission];
        }

        if (
            this._typePermissionGroupRequestorMap[type] &&
            Object.keys(this._typePermissionGroupRequestorMap[type]).length == 0
        ) {
            delete this._typePermissionGroupRequestorMap[type];
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
