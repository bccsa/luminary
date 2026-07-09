import "reflect-metadata";
import { plainToClass } from "class-transformer";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { validateChangeRequestAccess } from "./validateChangeRequestAccess";
import { DbService } from "../db/db.service";
import { DocType } from "../enums";

/**
 * Owner-only write rule for UserAffinity docs.
 *
 * No CouchDB needed: the UserAffinity branch returns before any group/ACL lookup,
 * and only `getDoc` is touched. This is the security boundary that replaces group
 * scoping for per-user-private affinity profiles — a user may write ONLY the doc
 * whose id encodes their own user id.
 */
describe("validateChangeRequestAccess — UserAffinity (owner-only)", () => {
    const db = { getDoc: jest.fn() } as unknown as DbService;

    beforeEach(() => {
        jest.clearAllMocks();
        // No existing doc → treated as a new document.
        (db.getDoc as jest.Mock).mockResolvedValue({ docs: [] });
    });

    const affinityReq = (id: string) =>
        plainToClass(ChangeReqDto, {
            doc: { _id: id, type: DocType.UserAffinity, affinity: { "tag-a": 0.5 } },
        });

    it("allows a user to write their own affinity doc", async () => {
        const res = await validateChangeRequestAccess(
            affinityReq("user-affinity-user-1"),
            [],
            db,
            "user-1",
        );
        expect(res.validated).toBe(true);
    });

    it("allows updating an existing own affinity doc", async () => {
        (db.getDoc as jest.Mock).mockResolvedValue({
            docs: [{ _id: "user-affinity-user-1", type: DocType.UserAffinity, ownerId: "user-1" }],
        });
        const res = await validateChangeRequestAccess(
            affinityReq("user-affinity-user-1"),
            [],
            db,
            "user-1",
        );
        expect(res.validated).toBe(true);
    });

    it("rejects writing another user's affinity doc", async () => {
        const res = await validateChangeRequestAccess(
            affinityReq("user-affinity-user-2"),
            [],
            db,
            "user-1",
        );
        expect(res.validated).toBe(false);
        expect(res.error).toMatch(/No access to this affinity document/);
    });

    it("rejects an unauthenticated (guest) write", async () => {
        const res = await validateChangeRequestAccess(
            affinityReq("user-affinity-user-1"),
            [],
            db,
            undefined,
        );
        expect(res.validated).toBe(false);
    });

    it("rejects an id that does not encode the caller's user id", async () => {
        const res = await validateChangeRequestAccess(
            affinityReq("affinity-user-1"),
            [],
            db,
            "user-1",
        );
        expect(res.validated).toBe(false);
    });

    it("grants no access via group membership — even a privileged group", async () => {
        const res = await validateChangeRequestAccess(
            affinityReq("user-affinity-user-2"),
            ["group-super-admins"],
            db,
            "user-1",
        );
        expect(res.validated).toBe(false);
    });
});
