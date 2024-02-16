import { Uuid, DocType, AclPermission, PublishStatus } from "../enums";
import { GroupAclEntryDto } from "../dto/GroupAclEntryDto";
import { GroupDto } from "../dto/GroupDto";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { DbService } from "../db/db.service";
import { MangoResponse } from "nano";
import { plainToClass } from "class-transformer";
import { LanguageDto } from "../dto/LanguageDto";

/**
 * Acl map entry used internally in Group objects
 */
type AclMapEntry = {
    ref: PermissionSystem;
    types: Map<DocType, Map<AclPermission, boolean>>;
};

/**
 * Global Group Map used for permission lookups
 */
const groupMap: Map<Uuid, PermissionSystem> = new Map<Uuid, PermissionSystem>();

/**
 * Access Map used for access calculations
 */
export class AccessMap {
    // TODO: Move to a separate file
    /**
     * Get list of effective access (including inherited access) for the passed group IDs per docType and permission
     * @param types - Document for which effective access should be calculated
     * @param permission - Permission for which effective access should be calculated
     */
    public calculateAccess: (types: DocType[], permission: AclPermission) => Array<Uuid>;

    public Map: Map<Uuid, Map<DocType, Map<AclPermission, boolean>>>;

    constructor() {
        this.Map = new Map<Uuid, Map<DocType, Map<AclPermission, boolean>>>();

        this.calculateAccess = function (types: DocType[], permission: AclPermission): Array<Uuid> {
            const resultSet = new Set<Uuid>();
            Object.keys(this.Map).forEach((groupId: Uuid) => {
                Object.keys(this.Map[groupId])
                    .filter((t: DocType) => types.includes(t))
                    .forEach((docType: DocType) => {
                        Object.keys(this.Map[groupId][docType])
                            .filter((t: AclPermission) => t === permission)
                            .forEach(() => {
                                // Add to set to avoid duplicates
                                resultSet.add(groupId);
                            });
                    });
            });

            // Return only the group IDs as array.
            return Array.from(resultSet);
        };
    }
}

/**
 * Permission system class
 */
export class PermissionSystem {
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
        const resultMap = new AccessMap();
        groupIds.forEach((id: Uuid) => {
            const g = groupMap[id];
            if (!g) return;

            resultMap.Map = { ...resultMap, ...g._groupTypePermissionMap };
        });
        return resultMap;
    }

    /**
     * Validate a change request against a user's access map
     * @param changeReq Change Request document
     * @param accessMap Access map to validate change request against
     * @param dbService Database connection instance
     */
    static async validateChangeRequest(
        changeReq: ChangeReqDto,
        accessMap: AccessMap,
        dbService: DbService,
    ) {
        // To save changes to a document / create a new document, a user needs to have the required permission
        // (e.g. edit, translate, assign) to all of the groups of which the document is a member of.

        const doc = changeReq.doc;
        // Validate edit, translate and group ACL assign access
        // ====================================================

        if (doc.type === DocType.Group) {
            // Check group edit access
            // -----------------------
            const editGroups = accessMap.calculateAccess([DocType.Group], AclPermission.Edit);
            if (!editGroups.includes(doc._id)) {
                return "No access to 'Edit' document type 'Group'";
            }

            // Check assign access for groups in ACL list
            // ------------------------------------------
            const assignGroups = accessMap.calculateAccess([DocType.Group], AclPermission.Assign);
            for (const aclEntry of doc.acl) {
                // Check if the user has assign access to the ACL entry's group
                if (!assignGroups.includes(aclEntry.groupId)) {
                    return "No access to 'Assign' one or more groups to the group ACL";
                }
            }
        } else if (doc.type === DocType.Content) {
            // Check language/translate and publish access for Content documents
            // -----------------------------------------------------------------

            // Get the parent document (post / tag) from the database
            const parentDoc = await dbService.getParentDoc(doc._id);
            if (!parentDoc) {
                return "Parent document not found";
            }

            // Check if the user has translate access to the Content document's parent document (post / tag)
            // Note: Content documents are always saved with the same group membership as their parent (post / tag) document
            const translateGroups = accessMap.calculateAccess(
                [parentDoc.type],
                AclPermission.Translate,
            );

            for (const groupId of parentDoc.memberOf) {
                if (!translateGroups.includes(groupId)) {
                    return "No access to 'Translate' document";
                }
            }

            // Check if the user has access to the language of the Content document
            const dbLangDoc = await dbService.getDocs([doc.language], [DocType.Language]);
            if (dbLangDoc.docs.length > 0) {
                const language = plainToClass(LanguageDto, dbLangDoc.docs[0]);

                // Get groups to which the user has Translate access to for Language documents
                const userLanguageGroups = accessMap.calculateAccess(
                    [DocType.Language],
                    AclPermission.Translate,
                );

                for (const groupId of language.memberOf) {
                    if (!userLanguageGroups.includes(groupId)) {
                        return "No 'Translate' access to the language of the Content object";
                    }
                }
            }

            // Check if the user has access to set the publishStatus to Published
            if (doc.status === PublishStatus.Published) {
                const publishGroups = accessMap.calculateAccess(
                    [parentDoc.type],
                    AclPermission.Publish,
                );
                for (const groupId of parentDoc.memberOf) {
                    if (!publishGroups.includes(groupId)) {
                        return "No 'Publish' access to document type 'Content'";
                    }
                }
            }
        } else if (doc.memberOf && Array.isArray(doc.memberOf) && doc.memberOf.length > 0) {
            // Check if user has edit access to any other types of documents
            // -------------------------------------------------------------
            const editGroups = accessMap.calculateAccess([doc.type], AclPermission.Edit);
            for (const groupId of doc.memberOf) {
                if (!editGroups.includes(groupId)) {
                    return "No 'Edit' access to one or more groups";
                }
            }
        } else {
            return "Unable to verify access. The document is not a group or does not have group membership";
        }

        // Validate tag assign access
        // ============================
        if (doc.tags) {
            // Get tag documents from database
            const tagDocs: MangoResponse<unknown> = await dbService.getDocs(doc.tags, [
                DocType.Tag,
            ]);

            // Get array of groups to which the user has Assign access
            const assignGroups = accessMap.calculateAccess([DocType.Tag], AclPermission.Assign);

            // Compare tag group membership with groups to which the user has assign access to
            if (tagDocs.docs && Array.isArray(tagDocs.docs)) {
                for (const d of tagDocs.docs) {
                    const tagDoc = d as any;
                    if (tagDoc.memberOf && Array.isArray(tagDoc.memberOf)) {
                        for (const groupId of tagDoc.memberOf) {
                            if (!assignGroups.includes(groupId)) {
                                return "No 'Assign' access to one or more tags";
                            }
                        }
                    }
                }
            }
        }

        return ""; // Empty response means the vaildation passed (i.e. no error)
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
