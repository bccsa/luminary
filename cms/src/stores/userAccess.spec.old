import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useUserAccessStore } from "./userAccess";
import { AclPermission, DocType } from "@/types";

describe("userAccess store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("verifies access for a docType and permission", () => {
        const store = useUserAccessStore();
        store.accessMap = {
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
        let result = store.verifyAccess(
            ["group-private-editors"],
            DocType.Post,
            AclPermission.Edit,
        );
        expect(result).toBe(true);

        // Non-assigned access
        result = store.verifyAccess(["group-private-editors"], DocType.Post, AclPermission.Delete);
        expect(result).toBe(false);

        // DocType exists in the map but permission doesn't
        result = store.verifyAccess(["group-private-editors"], DocType.Post, AclPermission.Create);
        expect(result).toBe(false);

        // Both docType and permission don't exist in the map
        result = store.verifyAccess(["group-private-editors"], DocType.Group, AclPermission.Assign);
        expect(result).toBe(false);

        // Group doesn't exist in the map
        result = store.verifyAccess(["unknown-group"], DocType.Post, AclPermission.Create);
        expect(result).toBe(false);

        // private-editors has the permission but public-editors doesn't
        result = store.verifyAccess(
            ["group-private-editors", "group-public-editors"],
            DocType.Post,
            AclPermission.Edit,
        );
        expect(result).toBe(true);
    });
});
