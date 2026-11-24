import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserDataService } from "./userData.service";
import { UserQueryService } from "./userQuery.service";
import { UserChangeRequestService } from "./userChangeRequest.service";
import { UserDataDbService } from "./userDataDb.service";
import { MAX_HIGHLIGHT_TEXT_LENGTH } from "../dto/UserActivityDto";
import { MAX_ACTIVITY_ID_LENGTH } from "../dto/UserActivityDto";
import { UserActivityType } from "../enums";
import { USER_ACTIVITY_SOURCE, userActivityDocumentId } from "./activityIdentity";
import { ownerKey } from "../auth/ownerKey";

describe("User-data services", () => {
    const user = { groups: [], jwtPayload: { iss: "https://issuer.example", sub: "subject-123" } };
    const owner = ownerKey(user, "secret");
    const activity = {
        _id: userActivityDocumentId({ type: "liked", parentId: "page-privacy-policy" }),
        type: UserActivityType.Liked,
        parentId: "page-privacy-policy",
        activityTimeUtc: 123,
    };
    const passage = { start: 0, end: 10, color: "yellow", text: "some text" };
    const highlight = {
        ...activity,
        _id: userActivityDocumentId({
            type: "highlighted",
            parentId: activity.parentId,
            contentId: "content:a",
            range: passage,
        }),
        type: UserActivityType.Highlighted,
        contentId: "content:a",
        range: passage,
    };
    let db: {
        enabled: boolean;
        assertEnabled: jest.Mock;
        upsert: jest.Mock;
        partitionedFind: jest.Mock;
    };
    let service: UserChangeRequestService;
    let queries: UserQueryService;

    beforeEach(() => {
        db = {
            enabled: true,
            assertEnabled: jest.fn(),
            upsert: jest.fn().mockImplementation(async (_owner, doc) => ({ stale: false, doc })),
            partitionedFind: jest.fn().mockResolvedValue({ docs: [] }),
        };
        const config = new ConfigService({ userData: { idSecret: "secret" } });
        const documents = new UserDataService(db as unknown as UserDataDbService);
        service = new UserChangeRequestService(db as unknown as UserDataDbService, documents);
        queries = new UserQueryService(db as unknown as UserDataDbService, config, documents);
    });

    it.each(["viewed", "liked", "highlighted"] as const)(
        "accepts the %s DTO with its UUID identity",
        async (type) => {
            const doc =
                type === "highlighted"
                    ? highlight
                    : {
                          ...activity,
                          type,
                          _id: userActivityDocumentId({ type, parentId: activity.parentId }),
                      };
            expect(
                (
                    await service.changeRequest(
                        {
                            ...doc,
                            _rev: "forged",
                            updatedTimeUtc: 999,
                            updatedBy: "forged",
                            deleteReq: 1,
                            memberOf: ["admins"],
                        },
                        owner,
                    )
                ).ack,
            ).toBe("accepted");
            expect(db.upsert).toHaveBeenCalledWith(owner, doc);
            expect(db.upsert.mock.calls[0][1]).not.toHaveProperty("activityType");
            expect(db.upsert.mock.calls[0][1]._id).toHaveLength(36);
        },
    );

    it("requires a UUID tied to the activity identity", async () => {
        const doc = activity;
        const wrong = {
            ...activity,
            _id: userActivityDocumentId({ type: "liked", parentId: "other" }),
        };
        expect((await service.changeRequest({ ...doc, _id: wrong._id }, owner)).ack).toBe(
            "rejected",
        );
        expect(
            (await service.changeRequest({ ...doc, _id: "liked:page-privacy-policy" }, owner)).ack,
        ).toBe("rejected");
        expect(db.upsert).not.toHaveBeenCalled();
    });

    it("rejects unknown activity kinds", async () => {
        expect((await service.changeRequest({ ...activity, type: "device" }, owner)).ack).toBe(
            "rejected",
        );
        expect(db.upsert).not.toHaveBeenCalled();
    });

    it("validates passage fields and retains only offsets in a removed highlight", async () => {
        const doc = highlight;
        for (const range of [
            { start: 0, end: 10 },
            { start: 0, end: 10, color: "orange", text: "hello" },
            { start: 10, end: 0, color: "blue", text: "hello" },
        ]) {
            expect((await service.changeRequest({ ...doc, range }, owner)).ack).toBe("rejected");
        }
        expect((await service.changeRequest({ ...doc, deleted: true }, owner)).ack).toBe(
            "accepted",
        );
        expect(db.upsert.mock.calls[0][1].range).toEqual({ start: 0, end: 10 });
    });

    it("returns UUID documents from typed owner queries", async () => {
        const doc = { ...highlight, updatedTimeUtc: 1000 };
        db.partitionedFind.mockResolvedValue({
            docs: [{ ...doc, _id: `${owner}:${doc._id}` }],
            bookmark: "internal",
        });
        const result = await queries.query(
            { dataSource: USER_ACTIVITY_SOURCE, selector: { type: "highlighted" } },
            owner,
        );
        expect(result.docs).toEqual([doc]);
        expect(result.docs[0]).not.toHaveProperty("activityType");
        expect(result).not.toHaveProperty("bookmark");
        expect(db.partitionedFind).toHaveBeenCalledWith(
            owner,
            expect.objectContaining({
                selector: { type: "highlighted" },
                use_index: "sync-highlighted-index",
            }),
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
            owner,
        );
        expect(result.ack).toBe("accepted");
        expect(db.upsert).toHaveBeenCalledWith(owner, activity);
    });

    it("accepts and sanitizes a passage", async () => {
        expect(
            (
                await service.changeRequest(
                    { ...highlight, range: { ...highlight.range, extra: "discard" } },
                    owner,
                )
            ).ack,
        ).toBe("accepted");
        expect(db.upsert).toHaveBeenCalledWith(owner, highlight);
    });

    it("accepts a highlight tombstone with only passage offsets", async () => {
        expect(
            (
                await service.changeRequest(
                    { ...highlight, deleted: true, range: { start: 0, end: 10 } },
                    owner,
                )
            ).ack,
        ).toBe("accepted");
    });

    it("accepts viewed history and its tombstone", async () => {
        const viewed = {
            ...activity,
            _id: userActivityDocumentId({ type: "viewed", parentId: activity.parentId }),
            type: UserActivityType.Viewed,
        };
        expect((await service.changeRequest(viewed, owner)).ack).toBe("accepted");
        expect((await service.changeRequest({ ...viewed, deleted: true }, owner)).ack).toBe(
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
        { ...activity, type: "device" },
        { ...activity, activityTimeUtc: -1 },
        { ...activity, activityTimeUtc: "123" },
        { ...activity, deleted: "true" },
        { ...highlight, range: undefined },
        { ...highlight, contentId: undefined },
        { ...highlight, range: { ...highlight.range, end: 0 } },
        {
            ...highlight,
            range: { ...highlight.range, text: "x".repeat(MAX_HIGHLIGHT_TEXT_LENGTH + 1) },
        },
        { ...activity, range: highlight.range },
    ])("returns a final rejected ack for invalid activity without writing", async (doc) => {
        const result = await service.changeRequest(doc, owner);
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
                        owner,
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
        const result = await service.changeRequest(activity, owner);
        expect(result.ack).toBe("rejected");
        expect(result.docs).toEqual([{ ...activity, activityTimeUtc: 999, updatedTimeUtc: 1000 }]);
        expect(JSON.stringify(result)).not.toContain(owner);
    });

    it("keeps database failures retryable instead of rejecting the queued edit", async () => {
        db.upsert.mockRejectedValue(new Error("database down"));
        await expect(service.changeRequest(activity, owner)).rejects.toThrow(
            ServiceUnavailableException,
        );
    });

    it("answers an unavailable source with an HTTP error even for an invalid doc", async () => {
        db.assertEnabled.mockImplementation(() => {
            throw new ServiceUnavailableException("disabled");
        });
        await expect(queries.query({ selector: { type: "liked" } }, owner)).rejects.toThrow(
            ServiceUnavailableException,
        );
        await expect(service.changeRequest({}, owner)).rejects.toThrow(ServiceUnavailableException);
    });

    it.each([{}, { type: "user" }, { type: { $in: ["userActivity", "device"] } }])(
        "requires a supported exact activity type in queries",
        async (selector) => {
            await expect(queries.query({ selector }, owner)).rejects.toThrow(BadRequestException);
            expect(db.partitionedFind).not.toHaveBeenCalled();
        },
    );

    it.each([0, Number.MAX_SAFE_INTEGER])(
        "accepts the sync engine's timestamp boundary %s",
        async (bound) => {
            const selector = { type: "liked", updatedTimeUtc: { $gte: 0, $lte: bound } };
            db.partitionedFind.mockResolvedValue({
                docs: [{ ...activity, _id: `${owner}:${activity._id}` }],
                bookmark: `opaque:${owner}`,
            });
            const result = await queries.query(
                { selector, dataSource: "user", identifier: "sync", limit: 100 },
                owner,
            );
            expect(db.partitionedFind).toHaveBeenCalledWith(
                owner,
                expect.objectContaining({
                    selector,
                    limit: 100,
                }),
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
        await expect(queries.query({ selector: { type: "liked" } }, owner)).rejects.toThrow(
            ServiceUnavailableException,
        );
    });

    it("reads the same client id independently for two authenticated owners", async () => {
        db.partitionedFind.mockImplementation(async (partition) => ({
            docs: [{ ...activity, _id: `${partition}:${activity._id}` }],
        }));
        const otherUser = { ...user, jwtPayload: { ...user.jwtPayload, sub: "another-user" } };
        const query = { selector: { type: "liked" } };
        expect((await queries.query(query, owner)).docs).toEqual([activity]);
        expect((await queries.query(query, ownerKey(otherUser, "secret"))).docs).toEqual([
            activity,
        ]);
        expect(db.partitionedFind.mock.calls[0][0]).not.toBe(db.partitionedFind.mock.calls[1][0]);
    });
});
