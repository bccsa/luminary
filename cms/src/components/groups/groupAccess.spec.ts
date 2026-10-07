import { describe, it, expect } from "vitest";
import { AclPermission, DocType, type GroupDto } from "luminary-shared";
import { groupsMissingDependencyAccess, groupsWithAccess } from "./groupAccess";

const group = (
    _id: string,
    acl: { type: DocType; groupId: string; permission: AclPermission[] }[],
): GroupDto =>
    ({ _id, type: DocType.Group, name: _id, acl, memberOf: [], updatedTimeUtc: 0 }) as GroupDto;

const View = [AclPermission.View];

describe("groupsWithAccess", () => {
    it("returns groups with a direct ACL entry for the type and permission", () => {
        const groups = [
            group("content", [
                { type: DocType.Post, groupId: "readers", permission: View },
                { type: DocType.Tag, groupId: "tag-only", permission: View },
                { type: DocType.Post, groupId: "no-perm", permission: [] },
            ]),
        ];

        expect([...groupsWithAccess("content", DocType.Post, AclPermission.View, groups)]).toEqual([
            "readers",
        ]);
    });

    it("includes groups that inherit through an accessor, whatever type that link is", () => {
        // Same shape as the API's permission service spec: top → middle → low.
        const groups = [
            group("low", [
                {
                    type: DocType.Language,
                    groupId: "middle",
                    permission: [AclPermission.View, AclPermission.Edit],
                },
            ]),
            group("middle", [{ type: DocType.Post, groupId: "top", permission: View }]),
            group("top", []),
        ];

        const result = groupsWithAccess("low", DocType.Language, AclPermission.Edit, groups);

        expect(result).toEqual(new Set(["middle", "top"]));
    });

    it("terminates on circular ACLs", () => {
        const groups = [
            group("a", [{ type: DocType.Post, groupId: "b", permission: View }]),
            group("b", [{ type: DocType.Post, groupId: "a", permission: View }]),
        ];

        expect(groupsWithAccess("a", DocType.Post, AclPermission.View, groups)).toEqual(
            new Set(["a", "b"]),
        );
    });

    it("returns nothing for an unknown group", () => {
        expect(groupsWithAccess("missing", DocType.Post, AclPermission.View, []).size).toBe(0);
    });
});

describe("groupsMissingDependencyAccess", () => {
    it("flags a group that can view the post but has no Storage view on the bucket's group", () => {
        const groups = [
            group("content", [{ type: DocType.Post, groupId: "readers", permission: View }]),
            group("readers", []),
        ];

        const missing = groupsMissingDependencyAccess(
            ["content"],
            DocType.Post,
            ["content"],
            DocType.Storage,
            groups,
        );

        expect(missing.map((g) => g._id)).toEqual(["readers"]);
    });

    it("does not flag a group that has Storage view directly", () => {
        const groups = [
            group("content", [
                { type: DocType.Post, groupId: "readers", permission: View },
                { type: DocType.Storage, groupId: "readers", permission: View },
            ]),
            group("readers", []),
        ];

        expect(
            groupsMissingDependencyAccess(
                ["content"],
                DocType.Post,
                ["content"],
                DocType.Storage,
                groups,
            ),
        ).toEqual([]);
    });

    it("does not flag a group that has Storage view on a different group holding the bucket", () => {
        const groups = [
            group("content", [{ type: DocType.Post, groupId: "readers", permission: View }]),
            group("buckets", [{ type: DocType.Storage, groupId: "readers", permission: View }]),
            group("readers", []),
        ];

        expect(
            groupsMissingDependencyAccess(
                ["content"],
                DocType.Post,
                ["buckets"],
                DocType.Storage,
                groups,
            ),
        ).toEqual([]);
    });

    it("has nothing to report when the bucket is in no known group", () => {
        const groups = [
            group("content", [{ type: DocType.Post, groupId: "readers", permission: View }]),
        ];

        expect(
            groupsMissingDependencyAccess(["content"], DocType.Post, [], DocType.Storage, groups),
        ).toEqual([]);
    });
});
