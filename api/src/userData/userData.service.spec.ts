import {
    BadRequestException,
    ServiceUnavailableException,
    UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserDataService } from "./userData.service";
import { UserDataDbService } from "./userDataDb.service";
import { MAX_ACTIVITY_ID_LENGTH, MAX_HIGHLIGHT_TEXT_LENGTH } from "../dto/UserActivityDto";
import { ownerKey } from "./ownerKey";

describe("UserDataService", () => {
    const user = { groups: [], jwtPayload: { iss: "https://issuer.example", sub: "subject-123" } };
    const owner = ownerKey(user, "secret");
    const activity = {
        _id: "liked:page-privacy-policy",
        type: "userActivity",
        activityType: "liked",
        parentId: "page-privacy-policy",
        activityTimeUtc: 123,
    };
    const highlight = {
        ...activity,
        _id: "highlighted:content:a:0-10",
        activityType: "highlighted",
        contentId: "content:a",
        payload: { range: { start: 0, end: 10, color: "yellow", text: "some text" } },
    };
    let db: {
        enabled: boolean;
        assertEnabled: jest.Mock;
        upsert: jest.Mock;
        partitionedFind: jest.Mock;
    };
    let service: UserDataService;

    beforeEach(() => {
        db = {
            enabled: true,
            assertEnabled: jest.fn(),
            upsert: jest.fn().mockImplementation(async (_owner, doc) => ({ stale: false, doc })),
            partitionedFind: jest.fn().mockResolvedValue({ docs: [] }),
        };
        service = new UserDataService(
            db as unknown as UserDataDbService,
            new ConfigService({ userData: { idSecret: "secret" } }),
        );
    });

    it("accepts non-UUID content ids and strips client server-fields and arbitrary properties", async () => {
        const result = await service.changeRequest(
            {
                ...activity,
                _rev: "forged",
                updatedTimeUtc: 999999,
                ownerId: "someone-else",
                memberOf: ["admins"],
                deleteReq: 123,
            },
            user,
        );
        expect(result.ack).toBe("accepted");
        expect(db.upsert).toHaveBeenCalledWith(owner, activity);
    });

    it("accepts and sanitizes one passage", async () => {
        expect(
            (
                await service.changeRequest(
                    { ...highlight, payload: { ...highlight.payload, extra: "discard" } },
                    user,
                )
            ).ack,
        ).toBe("accepted");
        expect(db.upsert).toHaveBeenCalledWith(owner, highlight);
    });

    it("accepts a highlight tombstone without a payload, as sent by the app", async () => {
        const deleted = { ...highlight };
        delete deleted.payload;
        expect((await service.changeRequest({ ...deleted, deleted: true }, user)).ack).toBe(
            "accepted",
        );
    });

    it("accepts viewed history and its tombstone", async () => {
        const viewed = { ...activity, _id: "viewed:page-privacy-policy", activityType: "viewed" };
        expect((await service.changeRequest(viewed, user)).ack).toBe("accepted");
        expect((await service.changeRequest({ ...viewed, deleted: true }, user)).ack).toBe(
            "accepted",
        );
    });

    it.each([
        null,
        [],
        {},
        { ...activity, _id: "_design/forged" },
        { ...activity, _id: "viewed:wrong-prefix" },
        { ...activity, _id: `liked:${"x".repeat(MAX_ACTIVITY_ID_LENGTH)}` },
        { ...activity, type: "user" },
        { ...activity, activityType: "device" },
        { ...activity, activityTimeUtc: -1 },
        { ...activity, activityTimeUtc: "123" },
        { ...activity, deleted: "true" },
        { ...highlight, payload: undefined },
        { ...highlight, contentId: undefined },
        { ...highlight, payload: { range: { ...highlight.payload.range, end: 0 } } },
        {
            ...highlight,
            payload: {
                range: {
                    ...highlight.payload.range,
                    text: "x".repeat(MAX_HIGHLIGHT_TEXT_LENGTH + 1),
                },
            },
        },
        { ...activity, payload: highlight.payload },
    ])("returns a final rejected ack for invalid activity without writing", async (doc) => {
        const result = await service.changeRequest(doc, user);
        expect(result.ack).toBe("rejected");
        expect(result.docs).toBeUndefined();
        expect(db.upsert).not.toHaveBeenCalled();
    });

    it("caps future activity timestamps at the server clock", async () => {
        const clock = jest.spyOn(Date, "now").mockReturnValue(1000);
        try {
            expect(
                (
                    await service.changeRequest(
                        { ...activity, activityTimeUtc: Number.MAX_SAFE_INTEGER },
                        user,
                    )
                ).ack,
            ).toBe("accepted");
            expect(db.upsert.mock.calls[0][1].activityTimeUtc).toBe(1000);
        } finally {
            clock.mockRestore();
        }
    });

    it("returns the stripped stored copy when an older upload loses", async () => {
        db.upsert.mockResolvedValue({
            stale: true,
            doc: {
                ...activity,
                _id: `${owner}:${activity._id}`,
                activityTimeUtc: 999,
                updatedTimeUtc: 1000,
            },
        });
        const result = await service.changeRequest(activity, user);
        expect(result.ack).toBe("rejected");
        expect(result.docs).toEqual([{ ...activity, activityTimeUtc: 999, updatedTimeUtc: 1000 }]);
        expect(JSON.stringify(result)).not.toContain(owner);
    });

    it("keeps database failures retryable instead of rejecting the queued edit", async () => {
        db.upsert.mockRejectedValue(new Error("database down"));
        await expect(service.changeRequest(activity, user)).rejects.toThrow(
            ServiceUnavailableException,
        );
    });

    it("requires authentication for both reads and writes", async () => {
        const anonymous = { groups: [], anonymous: true as const };
        await expect(
            service.query({ selector: { type: "userActivity" } }, anonymous),
        ).rejects.toThrow(UnauthorizedException);
        await expect(service.changeRequest(activity, anonymous)).rejects.toThrow(
            UnauthorizedException,
        );
        expect(db.upsert).not.toHaveBeenCalled();
        expect(db.partitionedFind).not.toHaveBeenCalled();
    });

    it("answers an unavailable source with an HTTP error even for an invalid doc", async () => {
        db.assertEnabled.mockImplementation(() => {
            throw new ServiceUnavailableException("disabled");
        });
        await expect(service.query({ selector: { type: "userActivity" } }, user)).rejects.toThrow(
            ServiceUnavailableException,
        );
        await expect(service.changeRequest({}, user)).rejects.toThrow(ServiceUnavailableException);
    });

    it.each([{}, { type: "user" }, { type: { $in: ["userActivity", "device"] } }])(
        "requires an exact userActivity type in queries",
        async (selector) => {
            await expect(service.query({ selector }, user)).rejects.toThrow(BadRequestException);
            expect(db.partitionedFind).not.toHaveBeenCalled();
        },
    );

    it.each([0, Number.MAX_SAFE_INTEGER])(
        "accepts the sync engine's timestamp boundary %s",
        async (bound) => {
            const selector = { type: "userActivity", updatedTimeUtc: { $gte: 0, $lte: bound } };
            db.partitionedFind.mockResolvedValue({
                docs: [{ ...activity, _id: `${owner}:${activity._id}` }],
                bookmark: `opaque:${owner}`,
            });
            const result = await service.query(
                { selector, dataSource: "user", identifier: "sync", limit: 100 },
                user,
            );
            expect(db.partitionedFind).toHaveBeenCalledWith(
                owner,
                expect.objectContaining({ selector, limit: 100 }),
            );
            expect(result.docs).toEqual([activity]);
            expect(result).not.toHaveProperty("bookmark");
            expect(JSON.stringify(result)).not.toContain(owner);
        },
    );

    it("does not leak a document returned under an unexpected partition id", async () => {
        db.partitionedFind.mockResolvedValue({
            docs: [{ ...activity, _id: "another-owner:liked:post" }],
        });
        await expect(service.query({ selector: { type: "userActivity" } }, user)).rejects.toThrow(
            ServiceUnavailableException,
        );
    });

    it("reads the same client id independently for two authenticated owners", async () => {
        db.partitionedFind.mockImplementation(async (partition) => ({
            docs: [{ ...activity, _id: `${partition}:${activity._id}` }],
        }));
        const otherUser = { ...user, jwtPayload: { ...user.jwtPayload, sub: "another-user" } };
        const query = { selector: { type: "userActivity" } };
        expect((await service.query(query, user)).docs).toEqual([activity]);
        expect((await service.query(query, otherUser)).docs).toEqual([activity]);
        expect(db.partitionedFind.mock.calls[0][0]).not.toBe(db.partitionedFind.mock.calls[1][0]);
    });
});
