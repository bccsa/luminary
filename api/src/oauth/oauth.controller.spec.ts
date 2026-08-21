import {
    BadRequestException,
    ForbiddenException,
    ServiceUnavailableException,
} from "@nestjs/common";
import { OauthController } from "./oauth.controller";

const reply = () => ({ redirect: jest.fn() }) as any;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe("OauthController", () => {
    let controller: OauthController;
    let fetchMock: jest.Mock;

    beforeEach(() => {
        controller = new OauthController();
        process.env.HYDRA_ADMIN_URL = "http://hydra:4445";
        process.env.HYDRA_TRUSTED_CLIENT_ID = "luminary-app";
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        delete process.env.HYDRA_ADMIN_URL;
        delete process.env.HYDRA_TRUSTED_CLIENT_ID;
        jest.restoreAllMocks();
    });

    it("refuses to act as a consent authority when no provider is configured", async () => {
        delete process.env.HYDRA_ADMIN_URL;
        await expect(controller.consent("challenge", reply())).rejects.toThrow(
            ServiceUnavailableException,
        );
    });

    it("rejects a request with no challenge", async () => {
        await expect(controller.consent("", reply())).rejects.toThrow(BadRequestException);
    });

    it("grants the trusted client exactly what it asked for", async () => {
        fetchMock
            .mockResolvedValueOnce(
                ok({
                    client: { client_id: "luminary-app" },
                    requested_scope: ["openid", "email"],
                    requested_access_token_audience: ["luminary-api"],
                }),
            )
            .mockResolvedValueOnce(ok({ redirect_to: "http://hydra/continue" }));

        const res = reply();
        await controller.consent("chal", res);

        const accept = JSON.parse(fetchMock.mock.calls[1][1].body);
        expect(accept.grant_scope).toEqual(["openid", "email"]);
        expect(accept.grant_access_token_audience).toEqual(["luminary-api"]);
        // The claims AutoGroupMappings conditions are written against.
        expect(accept.session.access_token).toEqual({ tier: "guest" });
        expect(res.redirect).toHaveBeenCalledWith("http://hydra/continue", 302);
    });

    it("will not skip the consent screen for any other client", async () => {
        fetchMock.mockResolvedValueOnce(ok({ client: { client_id: "someone-else" } }));

        await expect(controller.consent("chal", reply())).rejects.toThrow(ForbiddenException);
        // Nothing was granted.
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("accepts a logout challenge and sends the browser on", async () => {
        fetchMock.mockResolvedValueOnce(ok({ redirect_to: "http://app/bye" }));

        const res = reply();
        await controller.logout("chal", res);
        expect(res.redirect).toHaveBeenCalledWith("http://app/bye", 302);
    });
});
