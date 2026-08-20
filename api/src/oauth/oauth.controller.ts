import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Post,
    Query,
    Res,
    ServiceUnavailableException,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";

type ConsentRequest = {
    skip?: boolean;
    client?: { client_id?: string; client_name?: string; client_uri?: string; logo_uri?: string };
    requested_scope?: string[];
    requested_access_token_audience?: string[];
    subject?: string;
};

/** What the consent screen is allowed to know — deliberately not the whole request. */
export type ConsentView = {
    clientId: string;
    clientName: string;
    clientUri?: string;
    logoUri?: string;
    scopes: string[];
};

/**
 * Hydra's consent and logout hand-offs. The browser is redirected here, this
 * answers through Hydra's admin API, and sends the browser on. Nothing about
 * that admin API is ever exposed to the client.
 */
@Controller("oauth")
export class OauthController {
    /**
     * Read per call, not captured: with HYDRA_ADMIN_URL unset every request is
     * refused, so an environment that does not run Hydra cannot be talked into
     * acting as its consent authority.
     */
    private admin(): { adminUrl: string; trustedClientId?: string } {
        const adminUrl = process.env.HYDRA_ADMIN_URL?.replace(/\/+$/, "");
        if (!adminUrl) {
            throw new ServiceUnavailableException("No OAuth2 provider is configured");
        }
        return { adminUrl, trustedClientId: process.env.HYDRA_TRUSTED_CLIENT_ID };
    }

    private async hydra<T>(url: string, init?: RequestInit): Promise<T> {
        const response = await fetch(url, {
            ...init,
            headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
        });
        if (!response.ok) {
            throw new BadRequestException(`Hydra rejected the request (${response.status})`);
        }
        return (await response.json()) as T;
    }

    private challengeUrl(adminUrl: string, path: string, challenge: string): string {
        return `${adminUrl}/admin/oauth2/auth/requests/${path}?consent_challenge=${encodeURIComponent(
            challenge,
        )}`;
    }

    private consentRequest(adminUrl: string, challenge: string): Promise<ConsentRequest> {
        return this.hydra<ConsentRequest>(this.challengeUrl(adminUrl, "consent", challenge));
    }

    private grant(
        adminUrl: string,
        challenge: string,
        request: ConsentRequest,
        remember: boolean,
    ): Promise<{ redirect_to: string }> {
        return this.hydra<{ redirect_to: string }>(
            this.challengeUrl(adminUrl, "consent/accept", challenge),
            {
                method: "PUT",
                body: JSON.stringify({
                    grant_scope: request.requested_scope ?? [],
                    grant_access_token_audience: request.requested_access_token_audience ?? [],
                    remember,
                    remember_for: 0,
                    // The claims AutoGroupMappings conditions are written against.
                    // Hydra's allowed_top_level_claims promotes them out of `ext`,
                    // so a mapping reads `tier`, not `ext.tier`.
                    session: {
                        access_token: { tier: "guest" },
                        id_token: { tier: "guest" },
                    },
                }),
            },
        );
    }

    /**
     * Where Hydra sends the browser for consent, and where it is decided whether
     * a screen is needed at all. Hydra's own `skip` (this user already consented
     * and it was remembered) and the configured first-party client both grant
     * outright — there is nothing to delegate when the client and the identity
     * provider are the same product. Everything else goes to the screen.
     */
    @Get("consent")
    async consent(
        @Query("consent_challenge") challenge: string,
        @Res() reply: FastifyReply,
    ): Promise<void> {
        if (!challenge) throw new BadRequestException("Missing consent_challenge");
        const { adminUrl, trustedClientId } = this.admin();

        const request = await this.consentRequest(adminUrl, challenge);
        const isFirstParty = !!trustedClientId && request.client?.client_id === trustedClientId;

        if (request.skip || isFirstParty) {
            const { redirect_to } = await this.grant(adminUrl, challenge, request, true);
            reply.redirect(redirect_to, 302);
            return;
        }

        const ui = process.env.HYDRA_CONSENT_UI_URL;
        if (!ui) throw new ServiceUnavailableException("No consent screen is configured");
        reply.redirect(`${ui}?consent_challenge=${encodeURIComponent(challenge)}`, 302);
    }

    /** What the consent screen renders. The challenge is the only credential it needs. */
    @Get("consent/request")
    async consentView(@Query("consent_challenge") challenge: string): Promise<ConsentView> {
        if (!challenge) throw new BadRequestException("Missing consent_challenge");
        const { adminUrl } = this.admin();

        const request = await this.consentRequest(adminUrl, challenge);
        return {
            clientId: request.client?.client_id ?? "",
            clientName: request.client?.client_name || request.client?.client_id || "",
            clientUri: request.client?.client_uri || undefined,
            logoUri: request.client?.logo_uri || undefined,
            scopes: request.requested_scope ?? [],
        };
    }

    /** The user's answer. Hydra decides where the browser goes next, either way. */
    @Post("consent/decision")
    async consentDecision(
        @Body() body: { consent_challenge?: string; accept?: boolean; remember?: boolean },
    ): Promise<{ redirect_to: string }> {
        const challenge = body?.consent_challenge;
        if (!challenge) throw new BadRequestException("Missing consent_challenge");
        const { adminUrl } = this.admin();

        if (!body.accept) {
            return this.hydra<{ redirect_to: string }>(
                this.challengeUrl(adminUrl, "consent/reject", challenge),
                {
                    method: "PUT",
                    body: JSON.stringify({
                        error: "access_denied",
                        error_description: "The user did not allow this application.",
                    }),
                },
            );
        }

        const request = await this.consentRequest(adminUrl, challenge);
        return this.grant(adminUrl, challenge, request, body.remember ?? false);
    }

    /** The same hand-off for logout, which Hydra also routes through a challenge. */
    @Get("logout")
    async logout(
        @Query("logout_challenge") challenge: string,
        @Res() reply: FastifyReply,
    ): Promise<void> {
        if (!challenge) throw new BadRequestException("Missing logout_challenge");
        const { adminUrl } = this.admin();

        const { redirect_to } = await this.hydra<{ redirect_to: string }>(
            `${adminUrl}/admin/oauth2/auth/requests/logout/accept?logout_challenge=${encodeURIComponent(
                challenge,
            )}`,
            { method: "PUT" },
        );

        reply.redirect(redirect_to, 302);
    }
}
