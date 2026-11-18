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
import { UserDataService } from "../userData/userData.service";

describe("change-request source dispatch (mocked)", () => {
    const user = {
        userId: "user-1",
        groups: [],
        jwtPayload: { iss: "https://issuer.example", sub: "subject" },
    };
    let service: ChangeRequestService;
    let userData: { changeRequest: jest.Mock };
    let db: { getDoc: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        db = { getDoc: jest.fn() };
        userData = { changeRequest: jest.fn().mockResolvedValue({ ack: "accepted" }) };
        service = new ChangeRequestService(
            db as unknown as DbService,
            { invalidate: jest.fn() } as unknown as IdentityCacheService,
            userData as unknown as UserDataService,
        );
        (processChangeRequest as jest.Mock).mockResolvedValue({});
    });

    it("preserves the shared path when dataSource is omitted", async () => {
        const request = { doc: { _id: "post-a", type: "post" } };
        expect((await service.changeRequest(request, user)).ack).toBe("accepted");
        expect(processChangeRequest).toHaveBeenCalledWith(user.userId, request, user.groups, db);
        expect(userData.changeRequest).not.toHaveBeenCalled();
    });

    it("never sends a user-source request to shared processing or rejection lookups", async () => {
        const doc = { _id: "liked:post-a", type: "userActivity" };
        await service.changeRequest({ dataSource: "user", doc }, user);
        expect(userData.changeRequest).toHaveBeenCalledWith(doc, user);
        expect(processChangeRequest).not.toHaveBeenCalled();
        expect(db.getDoc).not.toHaveBeenCalled();
    });

    it("preserves retryable source-off errors", async () => {
        userData.changeRequest.mockRejectedValue(new ServiceUnavailableException("disabled"));
        await expect(service.changeRequest({ dataSource: "user", doc: {} }, user)).rejects.toThrow(
            ServiceUnavailableException,
        );
        expect(db.getDoc).not.toHaveBeenCalled();
    });

    it("rejects unknown source values", async () => {
        await expect(service.changeRequest({ dataSource: "other", doc: {} }, user)).rejects.toThrow(
            BadRequestException,
        );
        expect(processChangeRequest).not.toHaveBeenCalled();
    });

    it("requires authentication on the user source and keeps the default anonymous ack", async () => {
        const anonymous = { groups: [], anonymous: true as const };
        await expect(
            service.changeRequest({ dataSource: "user", doc: {} }, anonymous),
        ).rejects.toThrow(UnauthorizedException);
        expect((await service.changeRequest({ doc: {} }, anonymous)).ack).toBe("rejected");
        expect(processChangeRequest).not.toHaveBeenCalled();
    });
});
