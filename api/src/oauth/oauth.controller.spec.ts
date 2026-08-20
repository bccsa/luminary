import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
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
        process.env.HYDRA_CONSENT_UI_URL = "http://app/auth/consent";
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        delete process.env.HYDRA_ADMIN_URL;
        delete process.env.HYDRA_TRUSTED_CLIENT_ID;
        delete process.env.HYDRA_CONSENT_UI_URL;
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

    it("sends any other client to the consent screen instead of granting it", async () => {
        fetchMock.mockResolvedValueOnce(ok({ client: { client_id: "someone-else" } }));

        const res = reply();
        await controller.consent("chal", res);

        // Read the request, granted nothing.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(res.redirect).toHaveBeenCalledWith(
            "http://app/auth/consent?consent_challenge=chal",
            302,
        );
    });

    it("refuses rather than granting silently when no screen is configured", async () => {
        delete process.env.HYDRA_CONSENT_UI_URL;
        fetchMock.mockResolvedValueOnce(ok({ client: { client_id: "someone-else" } }));

        await expect(controller.consent("chal", reply())).rejects.toThrow(
            ServiceUnavailableException,
        );
    });

    it("grants without a screen when Hydra says the user already consented", async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ skip: true, client: { client_id: "someone-else" } }))
            .mockResolvedValueOnce(ok({ redirect_to: "http://hydra/continue" }));

        const res = reply();
        await controller.consent("chal", res);
        expect(res.redirect).toHaveBeenCalledWith("http://hydra/continue", 302);
    });

    it("tells the screen only what it needs to render", async () => {
        fetchMock.mockResolvedValueOnce(
            ok({
                client: { client_id: "other", client_name: "Other App", logo_uri: "http://logo" },
                requested_scope: ["openid", "email"],
                subject: "identity-uuid",
            }),
        );

        const view = await controller.consentView("chal");
        expect(view).toEqual({
            clientId: "other",
            clientName: "Other App",
            clientUri: undefined,
            logoUri: "http://logo",
            scopes: ["openid", "email"],
        });
        // The subject is the caller's identity, and the screen has no use for it.
        expect(JSON.stringify(view)).not.toContain("identity-uuid");
    });

    it("rejects through Hydra when the user says no, and grants nothing", async () => {
        fetchMock.mockResolvedValueOnce(ok({ redirect_to: "http://hydra/denied" }));

        const result = await controller.consentDecision({
            consent_challenge: "chal",
            accept: false,
        });

        expect(result.redirect_to).toBe("http://hydra/denied");
        expect(fetchMock.mock.calls[0][0]).toContain("consent/reject");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("remembers the answer only when the user asked it to", async () => {
        fetchMock
            .mockResolvedValueOnce(ok({ requested_scope: ["openid"] }))
            .mockResolvedValueOnce(ok({ redirect_to: "http://hydra/continue" }));

        await controller.consentDecision({
            consent_challenge: "chal",
            accept: true,
            remember: true,
        });

        expect(JSON.parse(fetchMock.mock.calls[1][1].body).remember).toBe(true);
    });

    it("accepts a logout challenge and sends the browser on", async () => {
        fetchMock.mockResolvedValueOnce(ok({ redirect_to: "http://app/bye" }));

        const res = reply();
        await controller.logout("chal", res);
        expect(res.redirect).toHaveBeenCalledWith("http://app/bye", 302);
    });
});
