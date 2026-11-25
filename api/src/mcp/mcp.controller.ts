import { All, Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { Logger } from "winston";
import {
    AUTH_FAILURE_MESSAGE,
    AuthIdentityService,
    JwtUserDetails,
} from "../auth/authIdentity.service";
import { IdentityCacheService } from "../auth/identityCache.service";
import {
    bearerChallenge,
    hasMcpAccess,
    mcpRateLimitKey,
    NO_MCP_ACCESS_MESSAGE,
    protectedResourceMetadata,
} from "./mcpAuth";
import { McpSession } from "./mcpContext";
import { mcpSettings } from "./mcpProviderConfig";
import { McpService } from "./mcp.service";

/** Provider ids are UUIDs or slugs; anything else (e.g. CouchDB's `_all_docs`) never reaches the DB. */
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** Request headers never handed to the MCP handler: credentials and hop-by-hop headers. */
const DROPPED_HEADERS = new Set([
    "authorization",
    "cookie",
    "host",
    "connection",
    "content-length",
    "transfer-encoding",
    "keep-alive",
    "upgrade",
]);

function bearerToken(header: string | undefined): string | undefined {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
    return match?.[1];
}

/**
 * The MCP server for AI clients (Claude, ChatGPT, …): one endpoint per AuthProvider that has MCP
 * enabled, plus its RFC 9728 metadata. Auth is done here, not by AuthGuard: MCP never falls back
 * to anonymous and answers with OAuth challenges.
 */
@Controller()
export class McpController {
    constructor(
        private readonly authIdentityService: AuthIdentityService,
        private readonly identityCache: IdentityCacheService,
        private readonly mcpService: McpService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    @Get(".well-known/oauth-protected-resource/mcp/:providerId")
    async metadata(@Param("providerId") providerId: string, @Res() reply: FastifyReply) {
        const target = await this.target(providerId);
        if (!target) return reply.code(404).send({ statusCode: 404, message: "Not Found" });
        return reply
            .header("Cache-Control", "public, max-age=300")
            .send(protectedResourceMetadata(target.provider, target.settings));
    }

    @All("mcp/:providerId")
    async handle(
        @Param("providerId") providerId: string,
        @Req() request: FastifyRequest,
        @Res() reply: FastifyReply,
    ) {
        const target = await this.target(providerId);
        if (!target) return reply.code(404).send({ statusCode: 404, message: "Not Found" });
        const { settings } = target;

        const unauthorized = (invalidToken: boolean) =>
            reply
                .code(401)
                .header("WWW-Authenticate", bearerChallenge(settings.resourceUrl, invalidToken))
                .send({
                    statusCode: 401,
                    message: invalidToken ? AUTH_FAILURE_MESSAGE : "Authentication required",
                });

        const token = bearerToken(request.headers.authorization);
        if (!token) return unauthorized(false);

        let user: JwtUserDetails;
        try {
            user = await this.identityCache.resolveForMcp(token, providerId, {
                audience: settings.resourceUrl,
                allowedClientIds: settings.allowedClientIds,
            });
        } catch {
            return unauthorized(true);
        }

        const identityKey = mcpRateLimitKey(user, providerId);
        if (!identityKey) return unauthorized(true);

        // A plain 403 without a challenge: an insufficient_scope challenge would send clients
        // into a re-authorization loop, and no scope can grant McpView.
        if (!hasMcpAccess(user.accessMap)) {
            return reply.code(403).send({ statusCode: 403, message: NO_MCP_ACCESS_MESSAGE });
        }

        const session: McpSession = {
            user,
            providerId,
            settings,
            identityKey,
            clientId: user.jwtPayload?.azp ?? user.jwtPayload?.client_id,
        };
        await this.forward(request, reply, session);
    }

    private async target(providerId: string) {
        if (!PROVIDER_ID.test(providerId)) return undefined;
        const provider = await this.authIdentityService.getProvider(providerId);
        const settings = mcpSettings(provider);
        return settings ? { provider, settings } : undefined;
    }

    /** Hands the request to the web-standard MCP handler and streams its response back. */
    private async forward(request: FastifyRequest, reply: FastifyReply, session: McpSession) {
        const abort = new AbortController();
        reply.raw.on("close", () => {
            if (!reply.raw.writableFinished) abort.abort();
        });

        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
            if (value === undefined || DROPPED_HEADERS.has(name)) continue;
            for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
        }
        // The URL is the configured resource, never derived from the Host header.
        const webRequest = new Request(session.settings.resourceUrl, {
            method: request.method,
            headers,
            signal: abort.signal,
        });

        // From here the response is written directly, bypassing Fastify hooks and Nest's filter.
        reply.hijack();
        const raw = reply.raw;
        try {
            const response = await this.mcpService.fetch(webRequest, session, request.body);
            raw.statusCode = response.status;
            response.headers.forEach((value, name) => raw.setHeader(name, value));
            raw.setHeader("X-Content-Type-Options", "nosniff");
            if (response.body) await pipeline(Readable.fromWeb(response.body as any), raw);
            else raw.end();
        } catch (error) {
            if (abort.signal.aborted) return;
            this.logger.error("MCP request failed", {
                providerId: session.providerId,
                identity: session.identityKey,
                error: error instanceof Error ? error.message : String(error),
            });
            if (raw.headersSent) {
                raw.destroy();
            } else {
                raw.statusCode = 500;
                raw.setHeader("Content-Type", "application/json");
                raw.end(JSON.stringify({ statusCode: 500, message: "Internal server error" }));
            }
        }
    }
}
