import { validateAcl } from "./aclValidation";
import { AclPermission, DocType } from "../enums";
import { GroupAclEntryDto } from "../dto/GroupAclEntryDto";

function createEntry(
    type: DocType,
    groupId: string,
    permission: AclPermission[],
): GroupAclEntryDto {
    const entry = new GroupAclEntryDto();
    entry.type = type;
    entry.groupId = groupId;
    entry.permission = permission;
    return entry;
}

describe("validateAcl", () => {
    it("should auto-add View when other permissions are present", () => {
        const acl = [createEntry(DocType.Post, "g1", [AclPermission.Edit])];
        const result = validateAcl(acl);

        expect(result[0].permission).toContain(AclPermission.View);
        expect(result[0].permission).toContain(AclPermission.Edit);
    });

    it("should clear permissions when only non-View permissions result in empty after filtering", () => {
        const acl = [createEntry(DocType.Post, "g1", [])];
        const result = validateAcl(acl);

        // Empty permissions means no View, so entry is removed by compactAclEntries
        expect(result[0].permission).toHaveLength(0);
    });

    it("should remove Edit from Group type when Assign is missing", () => {
        const acl = [createEntry(DocType.Group, "g1", [AclPermission.View, AclPermission.Edit])];
        const result = validateAcl(acl);

        expect(result[0].permission).not.toContain(AclPermission.Edit);
        expect(result[0].permission).toContain(AclPermission.View);
    });

    it("should keep Edit on Group type when Assign is present", () => {
        const acl = [
            createEntry(DocType.Group, "g1", [
                AclPermission.View,
                AclPermission.Edit,
                AclPermission.Assign,
            ]),
        ];
        const result = validateAcl(acl);

        expect(result[0].permission).toContain(AclPermission.Edit);
        expect(result[0].permission).toContain(AclPermission.Assign);
    });

    it("should filter out unavailable permissions for DocType", () => {
        // Publish is not available for Group type
        const acl = [
            createEntry(DocType.Group, "g1", [AclPermission.View, AclPermission.Publish as any]),
        ];
        const result = validateAcl(acl);

        expect(result[0].permission).not.toContain(AclPermission.Publish);
        expect(result[0].permission).toContain(AclPermission.View);
    });

    it("should remove entries with invalid DocType", () => {
        const acl = [createEntry("invalid" as DocType, "g1", [AclPermission.View])];
        const result = validateAcl(acl);

        // Invalid doc type filtered by isPermissionAvailable
        expect(result[0].permission).toHaveLength(0);
    });

    it("should deep-clone input and not mutate the original", () => {
        const acl = [createEntry(DocType.Post, "g1", [AclPermission.Edit])];
        const original = JSON.stringify(acl);
        validateAcl(acl);

        expect(JSON.stringify(acl)).toBe(original);
    });

    it("should handle multiple ACL entries", () => {
        const acl = [
            createEntry(DocType.Post, "g1", [AclPermission.View, AclPermission.Edit]),
            createEntry(DocType.Tag, "g2", [AclPermission.View, AclPermission.Publish]),
        ];
        const result = validateAcl(acl);

        expect(result).toHaveLength(2);
        expect(result[0].permission).toContain(AclPermission.Edit);
        expect(result[1].permission).toContain(AclPermission.Publish);
    });
});
