import "reflect-metadata";
import { plainToClass } from "class-transformer";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { validateChangeRequestAccess } from "./validateChangeRequestAccess";
import { PermissionSystem } from "../permissions/permissions.service";
import { AclPermission, DocType } from "../enums";
import { GLOBAL_AFFINITY_ID } from "../util/globalAffinity";

/**
 * Access rules for GlobalAffinity contributions, covered against a stubbed DbService so the
 * security boundary is verified without a CouchDB instance (the sibling
 * `validateChangeRequestAccess.spec.ts` needs one).
 */
describe("validateChangeRequestAccess — GlobalAffinity", () => {
    const STORED_GROUPS = ["group-public-content"];

    /** DbService stub returning the seeded singleton, or nothing if `exists` is false. */
    function mockDb(exists = true) {
        return {
            getDoc: jest.fn(async () => ({
                docs: exists
                    ? [
                          {
                              _id: GLOBAL_AFFINITY_ID,
                              type: DocType.GlobalAffinity,
                              memberOf: STORED_GROUPS,
                              affinity: { "tag-a": 0.5 },
                          },
                      ]
                    : [],
            })),
        } as any;
    }

    function contributionReq(overrides: Record<string, unknown> = {}) {
        return plainToClass(ChangeReqDto, {
            id: 1,
            doc: {
                _id: GLOBAL_AFFINITY_ID,
                type: DocType.GlobalAffinity,
                memberOf: STORED_GROUPS,
                contribution: { "tag-a": 1 },
                ...overrides,
            },
        });
    }

    let verifyAccess: jest.SpyInstance;

    afterEach(() => {
        verifyAccess?.mockRestore();
    });

    /** Grant only the named permission; everything else is denied. */
    function grantOnly(permission: AclPermission) {
        verifyAccess = jest
            .spyOn(PermissionSystem, "verifyAccess")
            .mockImplementation((_g, _t, p) => p === permission);
    }

    it("accepts a contribution from a group holding Contribute", async () => {
        grantOnly(AclPermission.Contribute);

        const res = await validateChangeRequestAccess(contributionReq(), ["group-a"], mockDb());

        expect(res.validated).toBe(true);
        expect(verifyAccess).toHaveBeenCalledWith(
            STORED_GROUPS,
            DocType.GlobalAffinity,
            AclPermission.Contribute,
            ["group-a"],
            "any",
        );
    });

    it("rejects a contribution without Contribute, even with Edit", async () => {
        grantOnly(AclPermission.Edit);

        const res = await validateChangeRequestAccess(contributionReq(), ["group-a"], mockDb());

        expect(res.validated).toBe(false);
        expect(res.error).toContain("Contribute");
    });

    it("rejects a contribution when only View is held", async () => {
        grantOnly(AclPermission.View);

        const res = await validateChangeRequestAccess(contributionReq(), ["group-a"], mockDb());

        expect(res.validated).toBe(false);
    });

    it("checks access against the stored groups, ignoring the client's memberOf", async () => {
        // Otherwise a contributor could name a group they happen to hold Contribute on and
        // write to a singleton scoped somewhere else entirely.
        grantOnly(AclPermission.Contribute);

        const res = await validateChangeRequestAccess(
            contributionReq({ memberOf: ["group-attacker-controls"] }),
            ["group-a"],
            mockDb(),
        );

        expect(res.validated).toBe(true);
        expect(verifyAccess).toHaveBeenCalledWith(
            STORED_GROUPS,
            DocType.GlobalAffinity,
            AclPermission.Contribute,
            ["group-a"],
            "any",
        );
        // The client's groups are replaced with the stored doc's, so the Assign check that
        // the generic path would run has nothing to act on.
        expect(res.validatedData.memberOf).toEqual(STORED_GROUPS);
    });

    it("never asks for Group/Assign — a contributor has no such permission", async () => {
        grantOnly(AclPermission.Contribute);

        await validateChangeRequestAccess(contributionReq(), ["group-a"], mockDb());

        const assignCalls = verifyAccess.mock.calls.filter(
            (call) => call[2] === AclPermission.Assign,
        );
        expect(assignCalls).toHaveLength(0);
    });

    it("rejects when the singleton has not been seeded", async () => {
        grantOnly(AclPermission.Contribute);

        const res = await validateChangeRequestAccess(
            contributionReq(),
            ["group-a"],
            mockDb(false),
        );

        expect(res.validated).toBe(false);
        expect(res.error).toContain("does not exist");
    });
});
