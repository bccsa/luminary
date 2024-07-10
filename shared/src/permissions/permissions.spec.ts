import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { AclPermission, DocType } from "../types";
import { accessMap, verifyAccess, hasAnyPermission, getAccessibleGroups } from "./permissions";

describe("permissions", () => {
    beforeEach(() => {});

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("verifies access for a docType and permission", () => {
        accessMap.value = {
            "group-private-editors": {
                post: {
                    view: true,
                    edit: true,
                    delete: false,
                },
            },
            "group-public-editors": {
                post: {
                    view: true,
                    edit: false,
                },
            },
        };

        // Assigned access
        let result = verifyAccess(["group-private-editors"], DocType.Post, AclPermission.Edit);
        expect(result).toBe(true);

        // Non-assigned access
        result = verifyAccess(["group-private-editors"], DocType.Post, AclPermission.Delete);
        expect(result).toBe(false);

        // DocType exists in the map but permission doesn't
        result = verifyAccess(["group-private-editors"], DocType.Post, AclPermission.Create);
        expect(result).toBe(false);

        // Both docType and permission don't exist in the map
        result = verifyAccess(["group-private-editors"], DocType.Group, AclPermission.Assign);
        expect(result).toBe(false);

        // Group doesn't exist in the map
        result = verifyAccess(["unknown-group"], DocType.Post, AclPermission.Create);
        expect(result).toBe(false);

        // private-editors has the permission but public-editors doesn't
        result = verifyAccess(
            ["group-private-editors", "group-public-editors"],
            DocType.Post,
            AclPermission.Edit,
        );
        expect(result).toBe(true);
    });

    it("checks if user has any permission for a docType", () => {
        accessMap.value = {
            "group-private-editors": {
                post: {
                    view: true,
                    edit: true,
                    delete: false,
                },
            },
            "group-public-editors": {
                post: {
                    view: true,
                    edit: false,
                },
            },
        };

        // Should return true because at least one group has the permission
        let result = hasAnyPermission(DocType.Post, AclPermission.View);
        expect(result).toBe(true);

        // Should return false because no group has the permission
        result = hasAnyPermission(DocType.Post, AclPermission.Create);
        expect(result).toBe(false);

        // Should return false because the docType doesn't exist in any group
        result = hasAnyPermission(DocType.Group, AclPermission.Assign);
        expect(result).toBe(false);
    });

    it("gets a list of accessible groups per document type for a given permission", () => {
        accessMap.value = {
            "group-private-editors": {
                post: {
                    view: true,
                    edit: true,
                    delete: true,
                },
                tag: {
                    view: true,
                    edit: false,
                },
            },
            "group-public-editors": {
                post: {
                    view: true,
                    edit: false,
                },
                tag: {
                    view: true,
                    edit: true,
                },
            },
        };

        let result = getAccessibleGroups(AclPermission.View);
        expect(result).toEqual({
            post: ["group-private-editors", "group-public-editors"],
            tag: ["group-private-editors", "group-public-editors"],
        });

        result = getAccessibleGroups(AclPermission.Edit);
        expect(result).toEqual({
            post: ["group-private-editors"],
            tag: ["group-public-editors"],
        });

        result = getAccessibleGroups(AclPermission.Delete);
        expect(result).toEqual({
            post: ["group-private-editors"],
        });

        result = getAccessibleGroups(AclPermission.Create);
        expect(result).toEqual({});

        console.log();
    });
});
