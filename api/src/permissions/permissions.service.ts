export enum AclPermission {
    View = "view",
    Assign = "assign",
    Edit = "edit",
    Translate = "translate",
    Publish = "publish",
    Delete = "delete",
}

export type AclEntry = {
    type: DocType;
    groupId: string;
    permission: Array<AclPermission>;
};

export type AclMapEntry = {
    ref: Group;
    types: Map<DocType, Map<AclPermission, boolean>>;
};

export enum DocType {
    Post = "post",
    Content = "content",
    Tag = "tag",
    Image = "image",
    Video = "video",
    Audio = "Audio",
    MediaDownload = "mediaDownload",
    User = "user",
    Language = "language",
    Change = "change",
    Group = "group",
}

/**
 * Global Group Map used for permission lookups
 */
export const groupMap: Map<string, Group> = new Map<string, Group>();

/**
 * Permission system Group class
 */
export class Group {
    private _typePermissionGroupRequestorMap = new Map<
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
     * Get effective access (including inherited access) for the passed group IDs per docType and permission
     * @param groupIds
     * @param groupMap
     * @param types
     * @param permissions
     */
    static getAccess(
        groupIds: Array<string>,
        groupMap: Map<string, Group>,
        types: Array<DocType>,
        permission: AclPermission,
    ): Array<string> {
        let map = new Map<string, Map<DocType, Map<AclPermission, boolean>>>();
        groupIds.forEach((id: string) => {
            const g = groupMap[id];
            if (!g) return;

            map = { ...map, ...g._groupTypePermissionMap };
        });

        const res = new Map<string, boolean>();
        Object.keys(map).forEach((groupId: string) => {
            Object.keys(map[groupId])
                .filter((t: DocType) => types.includes(t))
                .forEach((docType: DocType) => {
                    Object.keys(map[groupId][docType])
                        .filter((t: AclPermission) => t === permission)
                        .forEach(() => {
                            res[groupId] = true;
                        });
                });
        });
        return Object.keys(res);
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

        // Remove ACL's not passed with document
        Object.keys(g._aclMap).forEach((aclGroupId: string) => {
            if (!doc.acl.includes((t) => t.groupId[aclGroupId])) {
                Object.keys(g._aclMap[aclGroupId].types).forEach((docType: DocType) => {
                    g.updateAcl(g._aclMap[aclGroupId].ref, docType, []);
                });
            }
        });

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

                // Update parent's map
                parentGroup.removeMap(this.id, this.id, type, p);

                // Remove inherited permissions from parent's map
                Object.keys(this._childGroups).forEach((childGroupId: string) => {
                    parentGroup.removeMap(childGroupId, this.id, type, p);
                });
            }
        });

        // Add new permissions to aclMap
        permissions.forEach((p) => {
            if (!this._aclMap[parentGroup.id].types[type][p]) {
                this._aclMap[parentGroup.id].types[type][p] = true;

                // Update parent's map
                parentGroup.addMap(this.id, this.id, type, p);

                // Update inherited permissions to parent's map
                Object.keys(this._childGroups).forEach((childGroupId: string) => {
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
        childGroupId: string,
        requestorGroupId: string,
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
