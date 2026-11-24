jest.mock("../changeRequests/processChangeRequest", () => ({ processChangeRequest: jest.fn() }));

import {
    BadRequestException,
    ServiceUnavailableException,
    UnauthorizedException,
} from "@nestjs/common";
import { ChangeRequestService } from "./changeRequest.service";
import { processChangeRequest } from "../changeRequests/processChangeRequest";
import { DbService } from "../db/db.service";
import { IdentityCacheService } from "../auth/identityCache.service";
import { UserChangeRequestService } from "../userData/userChangeRequest.service";
import { ChangeRequestController } from "./changeRequest.controller";
import { ChangeRequestRateLimiterService } from "../ratelimit/changeRequestRateLimiter.service";
import { FastifyReply, FastifyRequest } from "fastify";

describe("change-request source dispatch (mocked)", () => {
    const user = {
        userId: "user-1",
        groups: [],
        jwtPayload: { iss: "https://issuer.example", sub: "subject" },
    };
    let service: ChangeRequestService;
    let controller: ChangeRequestController;
    let userData: { changeRequest: jest.Mock };
    let db: { getDoc: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        db = { getDoc: jest.fn() };
        userData = { changeRequest: jest.fn().mockResolvedValue({ ack: "accepted" }) };
        service = new ChangeRequestService(
            db as unknown as DbService,
            { invalidate: jest.fn() } as unknown as IdentityCacheService,
        );
        controller = new ChangeRequestController(
            service,
            {
                check: jest.fn().mockReturnValue({ allowed: true }),
                recordRequest: jest.fn(),
            } as unknown as ChangeRequestRateLimiterService,
            userData as unknown as UserChangeRequestService,
        );
        (processChangeRequest as jest.Mock).mockResolvedValue({});
    });

    const submit = (body: any, identity: any = user) =>
        controller.handleChangeRequest(
            { body, user: identity, ip: "127.0.0.1" } as FastifyRequest,
            { code: jest.fn() } as unknown as FastifyReply,
        );

    it("preserves the shared path when dataSource is omitted", async () => {
        const request = { doc: { _id: "post-a", type: "post" } };
        expect((await submit(request)).ack).toBe("accepted");
        expect(processChangeRequest).toHaveBeenCalledWith(user.userId, request, user.groups, db);
        expect(userData.changeRequest).not.toHaveBeenCalled();
    });

    it("preserves shared validation messages in rejected acknowledgements", async () => {
        (processChangeRequest as jest.Mock).mockRejectedValueOnce(
            new Error("Change request validation failed"),
        );
        db.getDoc.mockResolvedValue({ docs: [] });
        const request = { doc: { _id: "language", type: "language" } };
        expect(await submit(request)).toMatchObject({
            ack: "rejected",
            message: "Change request validation failed",
        });
        expect(db.getDoc).toHaveBeenCalledWith("language");
        expect(userData.changeRequest).not.toHaveBeenCalled();
    });

    it.each(["user"])(
        "refuses %s directly in the shared change-request service",
        async (dataSource) => {
            await expect(service.changeRequest({ dataSource, doc: {} }, user)).rejects.toThrow(
                BadRequestException,
            );
            expect(processChangeRequest).not.toHaveBeenCalled();
            expect(db.getDoc).not.toHaveBeenCalled();
        },
    );

    it.each(["user"])(
        "never sends a %s request to shared processing or rejection lookups",
        async (dataSource) => {
            const doc = {
                _id: "activity-id",
                type: "liked",
            };
            await submit({ dataSource, doc });
            expect(userData.changeRequest).toHaveBeenCalledWith(doc, user);
            expect(processChangeRequest).not.toHaveBeenCalled();
            expect(db.getDoc).not.toHaveBeenCalled();
        },
    );

    it("preserves retryable source-off errors", async () => {
        userData.changeRequest.mockRejectedValue(new ServiceUnavailableException("disabled"));
        await expect(submit({ dataSource: "user", doc: {} })).rejects.toThrow(
            ServiceUnavailableException,
        );
        expect(db.getDoc).not.toHaveBeenCalled();
    });

    it("rejects unknown source values", async () => {
        await expect(submit({ dataSource: "other", doc: {} })).rejects.toThrow(BadRequestException);
        expect(processChangeRequest).not.toHaveBeenCalled();
    });

    it("rejects anonymous requests before dispatch and keeps the shared service anonymous ack", async () => {
        const anonymous = { groups: [], anonymous: true as const };
        await expect(submit({ dataSource: "user", doc: {} }, anonymous)).rejects.toThrow(
            UnauthorizedException,
        );
        expect((await service.changeRequest({ doc: {} }, anonymous)).ack).toBe("rejected");
        expect(processChangeRequest).not.toHaveBeenCalled();
    });
});
