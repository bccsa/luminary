import { Uuid, DocType, AclPermission } from "../enums";
import { GroupAclEntryDto } from "../dto/GroupAclEntryDto";
import { GroupDto } from "../dto/GroupDto";
import { DbService } from "../db/db.service";
import { EventEmitter } from "node:events";

let dbService: DbService;

EventEmitter.setMaxListeners(Number.MAX_SAFE_INTEGER);

/**
 * Acl map entry used internally in Group objects containing ACL entries for a given parent group
 */
type AclGroupMap = {
    ref: PermissionSystem;
    types: Map<DocType, Map<AclPermission, boolean>>;
    eventHandlers: {
        parentListUpdated?: (event: GroupParentListUpdateEvent) => void;
        targetListUpdated?: (event: GroupTargetListUpdateEvent) => void;
    };
};

type GroupParentListUpdateEvent = {
    parent: PermissionSystem;
    action: "added" | "removed";
};

type GroupTargetListUpdateEvent = {
    target: Uuid;
    action: "added" | "removed";
};

type AclEntryUpdatedEvent = {
    aclGroup: AclGroupMap;
    type: DocType;
};

/**
 * Type Group Permission Map with references to target and route groups
 */
type TypeGroupPermissionMap = Map<
    /** Document Type */
    DocType,
    Map<
        /** Permission */
        AclPermission,
        Map<
            /** target group Uuid */
            Uuid,
            Map<
                /** route group Uuid */
                Uuid,
                boolean
            >
        >
    >
>;

/**
 * Group Type Permission Map with references to target and route groups
 */
type GroupTypePermissionMap = Map<
    /** target group Uuid */
    Uuid,
    Map<
        /** Document Type */
        DocType,
        Map<
            /** Permission */
            AclPermission,
            Map<
                /** route group Uuid */
                Uuid,
                boolean
            >
        >
    >
>;

/**
 * Route Target Map
 */
type TargetRouteTypeMap = Map<
    /** target group Uuid */
    Uuid,
    Map<
        /** route group Uuid */
        Uuid,
        Map<
            /** Document Type */
            DocType,
            boolean
        >
    >
>;

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
export class PermissionSystem extends EventEmitter {
    // The permission system is a tree structure where each node is representing a group.
    // Each group keeps track of implied permissions and references to parents (through the group's ACLs)
    // and to children (through the _typePermissionGroupMap and _groupTypePermissionMap).

    private _aclMap = new Map<Uuid, AclGroupMap>();
    private _typePermissionGroupMap: TypeGroupPermissionMap = new Map();
    private _groupTypePermissionMap: GroupTypePermissionMap = new Map();
    private _targetRouteTypeMap: TargetRouteTypeMap = new Map();
    private _accessMap: AccessMap = new Map();

    private _id: Uuid;

    private constructor(id: string) {
        super();
        this._id = id;

        // Subscribe to events
        this.on("aclEntryUpdated", this.upsertUpstreamInheritedMap);
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

        // Add changes that might have occurred while the permission system was being initialized
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
        const resultMap: AccessMap = new Map<Uuid, Map<DocType, Map<AclPermission, boolean>>>();

        if (groupIds) {
            groupIds.forEach((id: Uuid) => {
                const g = groupMap[id] as PermissionSystem;
                if (!g) return;

                // Add the access map of the group to the result map
                Object.keys(g._accessMap).forEach((key: Uuid) => {
                    const value = g._accessMap[key];
                    if (!resultMap[key]) resultMap[key] = {};

                    Object.keys(value).forEach((docType: DocType) => {
                        if (!resultMap[key][docType]) resultMap[key][docType] = {};
                        Object.keys(value[docType]).forEach((permission: AclPermission) => {
                            if (!resultMap[key][docType][permission]) {
                                resultMap[key][docType][permission] = true;
                            }
                        });
                    });
                });
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
            const g: PermissionSystem = groupMap[memberGroup];
            if (!g) return;
            types.forEach((type: DocType) => {
                if (
                    g._typePermissionGroupMap[type] &&
                    g._typePermissionGroupMap[type][permission]
                ) {
                    // Add to result map and remove duplicates
                    if (!resultMap[type]) resultMap[type] = [];
                    const unique = new Set([
                        ...resultMap[type],
                        ...Object.keys(g._typePermissionGroupMap[type][permission]),
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
        targetGroups: Array<Uuid>,
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
                    g._accessMap[targetGroup] &&
                    g._accessMap[targetGroup][type] &&
                    (g._accessMap[targetGroup][type][permission] ||
                        // Allow self-assigning permissions to groups if the user has edit access to the group (see issue #257)
                        (targetGroup == memberGroup &&
                            permission == AclPermission.Assign &&
                            g._accessMap[targetGroup][DocType.Group][AclPermission.Edit]))
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
            this.upsertGroup(groupDocs.splice(0, 1)[0], groupDocs);
        }
    }

    // Create or update single group
    private static upsertGroup(doc: GroupDto, groupDocs: Array<GroupDto>): PermissionSystem {
        let g: PermissionSystem;
        // Check if group is already in group map
        if (groupMap[doc._id]) {
            g = groupMap[doc._id];

            // Existing groups: Remove ACL's not passed with updated group document
            Object.keys(g._aclMap).forEach((aclGroupId: Uuid) => {
                Object.keys(g._aclMap[aclGroupId].types).forEach((docType: DocType) => {
                    if (
                        !doc.acl.some(
                            (t: GroupAclEntryDto) => t.groupId == aclGroupId && t.type == docType,
                        )
                    ) {
                        g.upsertAclEntry(g._aclMap[aclGroupId].ref, docType, []);
                    }
                });
            });
        } else {
            // Add new group
            g = new PermissionSystem(doc._id);
            groupMap[doc._id] = g;
        }

        doc.acl.forEach((aclEntry: GroupAclEntryDto) => {
            let parent: PermissionSystem = groupMap[aclEntry.groupId];

            // Create parent group if not existing
            if (!parent) {
                // find doc
                const i = groupDocs.findIndex((t) => t._id === aclEntry.groupId);
                if (i >= 0) {
                    const d = groupDocs.splice(i, 1)[0];
                    if (d) {
                        parent = this.upsertGroup(d, groupDocs);
                    }
                }
            }

            // If the parent now exists, add or update ACL's to this group
            if (parent) {
                g.upsertAclEntry(parent, aclEntry.type, aclEntry.permission);
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
        const g: PermissionSystem = groupMap[docId];
        if (g) {
            // Remove all ACL's
            Object.values(g._aclMap).forEach((_acl: AclGroupMap) => {
                const parentGroup = _acl.ref;
                Object.keys(_acl.types).forEach((_type: DocType) => {
                    g.upsertAclEntry(parentGroup, _type, []);
                });
            });

            // Delete from groupMap
            delete groupMap[docId];
        }
    }

    /**
     * Add or update acl to Group object and emits events if the ACL entry has changed and / or if the parent list has been updated
     */
    private upsertAclEntry(
        parentGroup: PermissionSystem,
        type: DocType,
        permissions: AclPermission[],
    ) {
        let parentAction: "added" | "removed";

        // Build ACL map
        if (!this._aclMap[parentGroup.id]) {
            this._aclMap[parentGroup.id] = {
                ref: parentGroup,
                types: {},
            };
            parentAction = "added";
        }

        if (!this._aclMap[parentGroup.id].types[type]) {
            this._aclMap[parentGroup.id].types[type] = {};
        }

        const aclGroup: AclGroupMap = this._aclMap[parentGroup.id];

        // Remove revoked permissions from aclMap
        Object.keys(aclGroup.types[type])
            .filter((p: AclPermission) => !permissions.includes(p))
            .forEach((p: AclPermission) => {
                delete aclGroup.types[type][p];
            });

        // Add new permissions to aclMap
        permissions.forEach((p) => {
            if (!aclGroup.types[type][p]) {
                aclGroup.types[type][p] = true;
            }
        });

        // Update downstream inherited permissions before cleaning up the ACL map.
        // If the ACL entry has been removed, the empty permissions array is needed to trigger the cleanup of inherited maps.
        this.upsertDownstreamInheritedMap(aclGroup, type);

        // Cleanup
        if (Object.keys(aclGroup.types[type]).length == 0) {
            delete aclGroup.types[type];
        }

        if (Object.keys(aclGroup.types).length == 0) {
            if (aclGroup.eventHandlers?.parentListUpdated) {
                parentGroup.off("parentListUpdated", aclGroup.eventHandlers.parentListUpdated);
            }

            if (aclGroup.eventHandlers?.targetListUpdated) {
                this.off("targetListUpdated", aclGroup.eventHandlers.targetListUpdated);
            }

            delete this._aclMap[parentGroup.id];

            parentAction = "removed";
        }

        // Trigger events
        if (parentAction) {
            this.emit("parentListUpdated", {
                parent: parentGroup,
                action: parentAction,
            } as GroupParentListUpdateEvent);
        }

        this.emit("aclEntryUpdated", { aclGroup, type } as AclEntryUpdatedEvent);
    }

    /**
     * Add or update the group's permission map with the passed permissions
     */
    private upsertMap(target: Uuid, route: Uuid, type: DocType, permissions: AclPermission[]) {
        // We are having two maps to simplify access calculations. In both cases the map needs to keep track of the directly connected route to the target group.
        // Map entries are created for each permission that is granted.

        // An access map is kept in parallel with the groupTypePermissionMap to make access calculations faster.

        // Build Group Type Permission map and access map.
        // -------------------------------
        if (!this._groupTypePermissionMap[target]) {
            this._groupTypePermissionMap[target] = {};
            this._accessMap[target] = {};

            this.emit("targetListUpdated", {
                target,
                action: "added",
            } as GroupTargetListUpdateEvent);
        }

        if (!this._groupTypePermissionMap[target][type]) {
            this._groupTypePermissionMap[target][type] = {};
            this._accessMap[target][type] = {};
        }

        // Add routes for new permissions
        Object.values(permissions).forEach((permission: AclPermission) => {
            if (!this._groupTypePermissionMap[target][type][permission]) {
                this._groupTypePermissionMap[target][type][permission] = {};
                this._accessMap[target][type][permission] = true;
            }

            if (!this._groupTypePermissionMap[target][type][permission][route]) {
                this._groupTypePermissionMap[target][type][permission][route] = true;
            }
        });

        // Remove routes for revoked permissions
        Object.keys(this._groupTypePermissionMap[target][type])
            .filter((p: AclPermission) => !permissions.includes(p))
            .forEach((permission: AclPermission) => {
                if (this._groupTypePermissionMap[target][type][permission][route]) {
                    delete this._groupTypePermissionMap[target][type][permission][route];
                }

                const routes = Object.keys(this._groupTypePermissionMap[target][type][permission]);
                if (routes.length == 0) {
                    delete this._groupTypePermissionMap[target][type][permission];
                    delete this._accessMap[target][type][permission];
                }
            });

        // Cleanup
        if (Object.keys(this._groupTypePermissionMap[target][type]).length == 0) {
            delete this._groupTypePermissionMap[target][type];
            delete this._accessMap[target][type];
        }

        if (Object.keys(this._groupTypePermissionMap[target]).length == 0) {
            delete this._groupTypePermissionMap[target];
            delete this._accessMap[target];

            this.emit("targetListUpdated", {
                target,
                action: "removed",
            } as GroupTargetListUpdateEvent);
        }

        // Build Type Permission Group map
        // -------------------------------
        if (!this._typePermissionGroupMap[type]) {
            this._typePermissionGroupMap[type] = {};
        }

        // Add routes for new permissions
        Object.values(permissions).forEach((permission: AclPermission) => {
            if (!this._typePermissionGroupMap[type][permission]) {
                this._typePermissionGroupMap[type][permission] = {};
            }

            if (!this._typePermissionGroupMap[type][permission][target]) {
                this._typePermissionGroupMap[type][permission][target] = {};
            }

            if (!this._typePermissionGroupMap[type][permission][target][route]) {
                this._typePermissionGroupMap[type][permission][target][route] = true;
            }
        });

        // Remove routes for revoked permissions
        Object.keys(this._typePermissionGroupMap[type])
            .filter((p: AclPermission) => !permissions.includes(p))
            .forEach((permission: AclPermission) => {
                if (
                    this._typePermissionGroupMap[type][permission][target] &&
                    this._typePermissionGroupMap[type][permission][target][route]
                ) {
                    delete this._typePermissionGroupMap[type][permission][target][route];
                }

                if (
                    this._typePermissionGroupMap[type][permission][target] &&
                    Object.keys(this._typePermissionGroupMap[type][permission][target]).length == 0
                ) {
                    delete this._typePermissionGroupMap[type][permission][target];
                }

                if (Object.keys(this._typePermissionGroupMap[type][permission]).length == 0) {
                    delete this._typePermissionGroupMap[type][permission];
                }
            });

        // Cleanup
        if (Object.keys(this._typePermissionGroupMap[type]).length == 0) {
            delete this._typePermissionGroupMap[type];
        }

        // Build Target Route Type map
        // ---------------------------
        if (permissions.length > 0) {
            if (!this._targetRouteTypeMap[target]) {
                this._targetRouteTypeMap[target] = {};
            }

            if (!this._targetRouteTypeMap[target][route]) {
                this._targetRouteTypeMap[target][route] = {};
            }

            if (!this._targetRouteTypeMap[target][route][type]) {
                this._targetRouteTypeMap[target][route][type] = true;
            }
        } else {
            if (
                this._targetRouteTypeMap[target] &&
                this._targetRouteTypeMap[target][route] &&
                this._targetRouteTypeMap[target][route][type]
            ) {
                delete this._targetRouteTypeMap[target][route][type];
            }

            if (
                this._targetRouteTypeMap[target] &&
                this._targetRouteTypeMap[target][route] &&
                Object.keys(this._targetRouteTypeMap[target][route]).length == 0
            ) {
                delete this._targetRouteTypeMap[target][route];
            }

            if (this._targetRouteTypeMap[target]) {
                const routes = Object.keys(this._targetRouteTypeMap[target]);

                if (routes.length == 1 && routes[0] == this.id) {
                    // The only route to the target group is from this group, which means that the remaining map is from a self-assigned permission map, which now should be removed.
                    delete this._groupTypePermissionMap[target];
                    delete this._accessMap[target];

                    Object.keys(this._typePermissionGroupMap).forEach((type: DocType) => {
                        Object.keys(this._typePermissionGroupMap[type]).forEach(
                            (permission: AclPermission) => {
                                if (this._typePermissionGroupMap[type][permission][target]) {
                                    delete this._typePermissionGroupMap[type][permission][target];
                                }
                            },
                        );
                    });
                }
            }

            if (
                this._targetRouteTypeMap[target] &&
                Object.keys(this._targetRouteTypeMap[target]).length == 0
            ) {
                delete this._targetRouteTypeMap[target];
            }
        }
    }

    /**
     * Update upstream inherited permissions on the parent group's map for a given ACL entry (referring to (1) in permissionSystem.drawio.svg)
     * This function is an event handler for the AclEntryUpdatedEvent, and should only be called from within a group (PermissionSystem) object (i.e. do not call it on parent or child groups)
     */
    private upsertUpstreamInheritedMap(event: AclEntryUpdatedEvent) {
        const parentGroup = event.aclGroup.ref;
        const permissions = event.aclGroup.types[event.type]
            ? (Object.keys(event.aclGroup.types[event.type]) as AclPermission[])
            : [];

        parentGroup.upsertMap(this.id, this.id, event.type, permissions);
        parentGroup.forwardInheritedMap(this.id, this.id, event.type, permissions);
    }

    /**
     * Update downstream inherited group maps for a given DocType in the passed ACL group map (referring to (3) in permissionSystem.drawio.svg)
     */
    private upsertDownstreamInheritedMap(aclGroup: AclGroupMap, type: DocType) {
        const parentGroup = aclGroup.ref;

        if (!aclGroup.types[type]) return;

        // Iterate over all target groups in existing map entries in this group excluding self-assigned permissions (target = this.id)
        Object.keys(this._groupTypePermissionMap)
            .filter((target: Uuid) => target != this.id)
            .forEach((target: Uuid) => {
                // Set the permissions of the passed ACL entry to the parent group for all children of this group.
                // This will give the parent group the same permissions to the children of this group as the parent group has to this group.
                const permissions = Object.keys(aclGroup.types[type]) as AclPermission[];
                parentGroup.upsertMap(target, this.id, type, permissions);
                parentGroup.forwardInheritedMap(target, this.id, type, permissions);
            });

        // Subscribe to this group's target group added / removed events the first time this function is called for a given parent group's ACL entries.
        if (!aclGroup.eventHandlers) aclGroup.eventHandlers = {};
        if (!aclGroup.eventHandlers.targetListUpdated) {
            const eventHandler = (event: GroupTargetListUpdateEvent) => {
                // Update the parent group's downstream inherited permissions with added / removed children to this group for all document types.
                Object.keys(aclGroup.types).forEach((_type: DocType) => {
                    const permissions =
                        event.action == "added"
                            ? (Object.keys(aclGroup.types[_type]) as AclPermission[])
                            : [];
                    parentGroup.upsertMap(event.target, this.id, _type, permissions);
                    parentGroup.forwardInheritedMap(event.target, this.id, _type, permissions);
                });

                // Note: The targetListUpdated event does not trigger when self-assigned permissions are present for a given target and document type
                // as the self-assigned permission maps are "sealing" the maps, preventing us from removing the downstream inherited maps with this event handler.
                // The cleanup for self-assigned permission maps is done in upsertMap().
            };

            aclGroup.eventHandlers.targetListUpdated = eventHandler;
            this.on("targetListUpdated", eventHandler);
        }
    }

    /**
     * Iteratively forward inherited group maps until the top level parent has been reached (referring to (3) in permissionSystem.drawio.svg)
     */
    private forwardInheritedMap(
        target: Uuid,
        route: string,
        type: DocType,
        permissions: AclPermission[],
    ) {
        // Prevent infinite loops with circular permissions (i.e. when a group is indirectly a parent of itself)
        if (route != this.id && route.includes(this.id)) return;

        const appendedRoute = this.id + "_" + route;
        // Forward inherited permissions to parent groups
        Object.values(this._aclMap)
            .filter((aclGroup: AclGroupMap) => aclGroup.ref.id != this.id) // Exclude self-assigned ACLs
            .forEach((aclGroup: AclGroupMap) => {
                const parentGroup = aclGroup.ref;
                parentGroup.upsertMap(target, appendedRoute + route, type, permissions);
                parentGroup.forwardInheritedMap(target, appendedRoute, type, permissions);

                // Subscribe to the parent's "parentListUpdated" event to update inherited permissions on the grandparent when the parent's ACL is updated.
                if (!aclGroup.eventHandlers) aclGroup.eventHandlers = {};
                if (!aclGroup.eventHandlers.parentListUpdated) {
                    const eventHandler = (event: GroupParentListUpdateEvent) => {
                        const grandparent = event.parent;
                        const _permissions = event.action == "added" ? permissions : [];
                        grandparent.upsertMap(target, parentGroup.id, type, _permissions);
                        grandparent.forwardInheritedMap(target, appendedRoute, type, _permissions);
                    };

                    aclGroup.eventHandlers.parentListUpdated = eventHandler;
                    parentGroup.on("parentListUpdated", eventHandler);
                }

                // Unsubscribe from parent's "parentListUpdated" event if the ACL entry has been removed
                if (aclGroup.eventHandlers.parentListUpdated && permissions.length == 0) {
                    parentGroup.off("parentListUpdated", aclGroup.eventHandlers.parentListUpdated);
                    delete aclGroup.eventHandlers.parentListUpdated;
                }
            });
    }

    /**
     * Check if a group exists in the permission system
     */
    static hasGroup(id: Uuid) {
        return groupMap[id] != undefined;
    }
}
