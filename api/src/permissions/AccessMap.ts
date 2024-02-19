import { DocType, Uuid, AclPermission } from "../enums";

/**
 * Access Map used for access calculations
 */
export class AccessMap {
    /**
     * Get list of effective access (including inherited access) for the passed group IDs per docType and permission
     * @param types - Document for which effective access should be calculated
     * @param permission - Permission for which effective access should be calculated
     */
    public calculateAccess: (types: DocType[], permission: AclPermission) => Array<Uuid>;

    public map: Map<Uuid, Map<DocType, Map<AclPermission, boolean>>>;

    constructor() {
        this.map = new Map<Uuid, Map<DocType, Map<AclPermission, boolean>>>();

        this.calculateAccess = function (types: DocType[], permission: AclPermission): Array<Uuid> {
            const resultSet = new Set<Uuid>();
            Object.keys(this.map).forEach((groupId: Uuid) => {
                Object.keys(this.map[groupId])
                    .filter((t: DocType) => types.includes(t))
                    .forEach((docType: DocType) => {
                        Object.keys(this.map[groupId][docType])
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
