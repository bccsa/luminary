import {
    BadRequestException,
    Controller,
    ForbiddenException,
    Get,
    Query,
    Res,
    ServiceUnavailableException,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";

type ConsentRequest = {
    client?: { client_id?: string };
    requested_scope?: string[];
    requested_access_token_audience?: string[];
    subject?: string;
    context?: Record<string, unknown>;
};

/**
 * Hydra's consent and logout hand-offs. The browser is redirected here, this
 * accepts the request through Hydra's admin API, and sends the browser back.
 * Nothing about Hydra's admin API is ever exposed to the client.
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

    /**
     * Grants exactly what the trusted client asked for. A first-party client has
     * nothing to delegate — the user is consenting to the application they are
     * already using — so there is no screen, but the grant is still explicit and
     * still refused for any other client.
     */
    @Get("consent")
    async consent(
        @Query("consent_challenge") challenge: string,
        @Res() reply: FastifyReply,
    ): Promise<void> {
        if (!challenge) throw new BadRequestException("Missing consent_challenge");
        const { adminUrl, trustedClientId } = this.admin();

        const request = await this.hydra<ConsentRequest>(
            `${adminUrl}/admin/oauth2/auth/requests/consent?consent_challenge=${encodeURIComponent(
                challenge,
            )}`,
        );

        const clientId = request.client?.client_id;
        if (!trustedClientId || clientId !== trustedClientId) {
            throw new ForbiddenException("This client requires a consent screen");
        }

        const { redirect_to } = await this.hydra<{ redirect_to: string }>(
            `${adminUrl}/admin/oauth2/auth/requests/consent/accept?consent_challenge=${encodeURIComponent(
                challenge,
            )}`,
            {
                method: "PUT",
                body: JSON.stringify({
                    grant_scope: request.requested_scope ?? [],
                    grant_access_token_audience: request.requested_access_token_audience ?? [],
                    remember: true,
                    remember_for: 0,
                    // Claims the AutoGroupMappings conditions are written against.
                    // Promoted to the top level by Hydra's allowed_top_level_claims,
                    // so a mapping reads `tier`, not `ext.tier`.
                    session: {
                        access_token: { tier: "guest" },
                        id_token: { tier: "guest" },
                    },
                }),
            },
        );

        reply.redirect(redirect_to, 302);
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
