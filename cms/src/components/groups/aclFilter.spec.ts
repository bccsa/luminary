import { describe, expect, it } from "vitest";
import { AclPermission, DocType, type GroupDto } from "luminary-shared";
import { aclEntryMatches, filterGroupAcl, isAclFilterActive } from "./aclFilter";

const group = {
    _id: "g1",
    type: DocType.Group,
    name: "G1",
    acl: [
        { groupId: "a", type: DocType.Post, permission: [AclPermission.View, AclPermission.Edit] },
        { groupId: "b", type: DocType.Post, permission: [AclPermission.View] },
        { groupId: "c", type: DocType.Tag, permission: [AclPermission.Edit] },
        { groupId: "d", type: DocType.Post, permission: [] },
    ],
} as unknown as GroupDto;

const ids = (f: { types: DocType[]; permissions: AclPermission[] }) =>
    filterGroupAcl([group], f)[0].acl.map((e) => e.groupId);

describe("aclFilter", () => {
    it("is inactive when empty and returns groups unchanged", () => {
        const f = { types: [], permissions: [] };
        expect(isAclFilterActive(f)).toBe(false);
        expect(filterGroupAcl([group], f)[0]).toBe(group);
    });

    it("matches doc type and permission together", () => {
        expect(ids({ types: [DocType.Post], permissions: [AclPermission.Edit] })).toEqual(["a"]);
    });

    it("matches doc type only", () => {
        expect(ids({ types: [DocType.Post], permissions: [] })).toEqual(["a", "b"]);
    });

    it("matches permission only", () => {
        expect(ids({ types: [], permissions: [AclPermission.Edit] })).toEqual(["a", "c"]);
    });

    it("requires all selected permissions", () => {
        expect(ids({ types: [], permissions: [AclPermission.View, AclPermission.Edit] })).toEqual([
            "a",
        ]);
    });

    it("never matches empty-permission entries", () => {
        expect(aclEntryMatches(group.acl[3], { types: [DocType.Post], permissions: [] })).toBe(
            false,
        );
    });
});
