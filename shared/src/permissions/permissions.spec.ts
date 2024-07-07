import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { AclPermission, DocType } from "../types";
import { accessMap, verifyAccess } from "./permissions";

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
});
