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
    it("should auto-add CmsView, not View, when a CMS-only permission is present", () => {
        const acl = [createEntry(DocType.Post, "g1", [AclPermission.Edit])];
        const result = validateAcl(acl);

        expect(result[0].permission).toContain(AclPermission.CmsView);
        expect(result[0].permission).toContain(AclPermission.Edit);
        expect(result[0].permission).not.toContain(AclPermission.View);
    });

    it("should leave a View-only entry alone", () => {
        const acl = [createEntry(DocType.Post, "g1", [AclPermission.View])];
        const result = validateAcl(acl);

        expect(result[0].permission).toEqual([AclPermission.View]);
    });

    it("should keep a CmsView-only entry", () => {
        const acl = [createEntry(DocType.Post, "g1", [AclPermission.CmsView])];
        const result = validateAcl(acl);

        expect(result[0].permission).toEqual([AclPermission.CmsView]);
    });

    // An entry from a client that doesn't send CmsView gains it, rather than having its CMS-only
    // permissions stripped (ADR 0005).
    it("should add CmsView to a View+Edit entry without dropping Edit", () => {
        const acl = [createEntry(DocType.Post, "g1", [AclPermission.View, AclPermission.Edit])];
        const result = validateAcl(acl);

        expect(result[0].permission).toContain(AclPermission.View);
        expect(result[0].permission).toContain(AclPermission.Edit);
        expect(result[0].permission).toContain(AclPermission.CmsView);
    });

    it("should remove entries with empty permissions", () => {
        const acl = [createEntry(DocType.Post, "g1", [])];
        const result = validateAcl(acl);

        // Empty permissions means no View, so entry is removed by compactAclEntries
        expect(result).toHaveLength(0);
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

        // Invalid doc type filtered out by compactAclEntries
        expect(result).toHaveLength(0);
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

    // CmsView (GitHub #160) is assignable on every CMS-managed doc type.
    it.each([
        DocType.Group,
        DocType.Language,
        DocType.Post,
        DocType.Tag,
        DocType.User,
        DocType.Redirect,
        DocType.Storage,
        DocType.AuthProvider,
        DocType.AutoGroupMappings,
    ])("should accept CmsView on doc type %s", (docType) => {
        const acl = [createEntry(docType, "g1", [AclPermission.View, AclPermission.CmsView])];
        const result = validateAcl(acl);

        expect(result[0].permission).toContain(AclPermission.CmsView);
        expect(result[0].permission).toContain(AclPermission.View);
    });

    it("should strip CmsView from a doc type not in availablePermissionsPerDocType", () => {
        // Crypto is an internal doc type with no ACL config → all permissions stripped, entry removed.
        const acl = [
            createEntry(DocType.Crypto, "g1", [AclPermission.View, AclPermission.CmsView]),
        ];
        const result = validateAcl(acl);

        expect(result).toHaveLength(0);
    });

    it("should reject an ACL entry for DocType.Sidecar (never replicable, never grantable)", () => {
        // Sidecar is absent from availablePermissionsPerDocType — the load-bearing
        // non-replication guarantee. An entry is stripped.
        const acl = [createEntry(DocType.Sidecar, "g1", [AclPermission.View, AclPermission.CmsView])];
        const result = validateAcl(acl);

        expect(result).toHaveLength(0);
    });
});
