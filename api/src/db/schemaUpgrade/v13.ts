import { DbService } from "../db.service";
import { AclPermission, DocType } from "../../enums";

type AclEntry = {
    type: DocType;
    groupId: string;
    permission: AclPermission[];
};

// oAuthProvider ACL entries that should exist in each group
const requiredAclEntries: Record<string, AclEntry[]> = {
    "group-public-content": [
        { type: DocType.OAuthProvider, groupId: "group-public-users", permission: [AclPermission.View] },
        { type: DocType.OAuthProvider, groupId: "group-private-users", permission: [AclPermission.View] },
    ],
    "group-public-users": [
        { type: DocType.OAuthProvider, groupId: "group-public-users", permission: [AclPermission.View] },
        { type: DocType.OAuthProvider, groupId: "group-private-users", permission: [AclPermission.View] },
    ],
    "group-super-admins": [
        {
            type: DocType.OAuthProvider,
            groupId: "group-super-admins",
            permission: [AclPermission.View, AclPermission.Create, AclPermission.Edit, AclPermission.Delete, AclPermission.Assign],
        },
        { type: DocType.OAuthProvider, groupId: "group-public-users", permission: [AclPermission.View] },
        { type: DocType.OAuthProvider, groupId: "group-private-users", permission: [AclPermission.View] },
    ],
};

/**
 * Upgrade the database schema from version 12 to 13.
 * Restores oAuthProvider ACL entries in group documents that had them stripped by
 * a previous version of aclValidation that did not include DocType.OAuthProvider.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion !== 12) {
            console.info(`Skipping schema upgrade v13: current version is ${schemaVersion}, expected 12`);
            return;
        }

        console.info("Upgrading database schema from version 12 to 13");

        for (const [groupId, entries] of Object.entries(requiredAclEntries)) {
            try {
                const result = await db.getDoc(groupId);
                if (!result.docs || result.docs.length === 0) {
                    console.info(`Group ${groupId} not found, skipping`);
                    continue;
                }

                const group = result.docs[0];
                if (!group.acl) group.acl = [];

                let modified = false;
                for (const entry of entries) {
                    const exists = group.acl.some(
                        (a: AclEntry) => a.type === entry.type && a.groupId === entry.groupId,
                    );
                    if (!exists) {
                        group.acl.push(entry);
                        modified = true;
                    }
                }

                if (modified) {
                    await db.insertDoc(group);
                    console.info(`Restored oAuthProvider ACL entries in ${groupId}`);
                } else {
                    console.info(`Group ${groupId} already has oAuthProvider ACL entries, skipping`);
                }
            } catch (error) {
                console.error(`Failed to update group ${groupId}:`, error);
                throw error;
            }
        }

        await db.setSchemaVersion(13);
        console.info("Database schema upgrade from version 12 to 13 completed successfully");
    } catch (error) {
        console.error("Database schema upgrade from version 12 to 13 failed:", error);
        throw error;
    }
}
