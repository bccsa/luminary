import { HttpException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
    CLIENT_CAPABILITIES_META_KEY,
    McpServer,
    RequestStateCodec,
    type ServerContext,
    type ToolAnnotations,
} from "@modelcontextprotocol/server";
import { Logger } from "winston";
import * as z from "zod";
import { JwtUserDetails } from "../auth/authIdentity.service";
import { DbService } from "../db/db.service";
import { ChangeRequestService } from "../endpoints/changeRequest.service";
import { FtsSearchService } from "../endpoints/ftsSearch.service";
import { QueryService } from "../endpoints/query.service";
import { RateLimitedException } from "../endpoints/requestPipeline";
import { ChangeRequestRateLimiterService } from "../ratelimit/changeRequestRateLimiter.service";
import { McpRateLimiterService } from "../ratelimit/mcpRateLimiter.service";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { McpProviderSettings } from "./mcpProviderConfig";

/** The verified caller of one MCP request, built by the controller before any tool runs. */
export type McpSession = {
    user: JwtUserDetails;
    providerId: string;
    settings: McpProviderSettings;
    /** Rate-limit identity, from {@link mcpRateLimitKey}. */
    identityKey: string;
    /** The token's `azp`/`client_id`, for the audit log. */
    clientId?: string;
};

/** What a live-change confirmation binds to; signed into `requestState` between the two calls. */
export type LiveChangeState = {
    tool: string;
    docId: string;
    version: string | null;
    changeHash: string;
};

export type McpToolDeps = {
    queryService: QueryService;
    ftsSearchService: FtsSearchService;
    changeRequestService: ChangeRequestService;
    configService: ConfigService;
    queryRateLimiter: QueryRateLimiterService;
    changeRequestRateLimiter: ChangeRequestRateLimiterService;
    mcpRateLimiter: McpRateLimiterService;
    db: DbService;
    logger: Logger;
    /** Absent when no ENCRYPTION_KEY is configured: live changes are then refused. */
    confirmCodec?: RequestStateCodec<LiveChangeState>;
};

export type ToolEnv = { session: McpSession; deps: McpToolDeps };

/** An error whose message is safe and useful to show the model. */
export class ToolError extends Error {
    constructor(
        message: string,
        readonly data?: Record<string, unknown>,
    ) {
        super(message);
    }
}

/** A successful tool result: the data as structured content plus the same JSON as text. */
export function toolResult(data: Record<string, unknown>) {
    return {
        structuredContent: data,
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
    };
}

/** A failed tool result the model can read and act on. */
export function toolErrorResult(message: string, data?: Record<string, unknown>) {
    return {
        isError: true,
        ...(data ? { structuredContent: { error: message, ...data } } : {}),
        content: [
            {
                type: "text" as const,
                text: data ? JSON.stringify({ error: message, ...data }) : message,
            },
        ],
    };
}

/** True when the client said it can show the human an elicitation (2026-07-28 envelope). */
export function clientCanElicit(ctx: ServerContext): boolean {
    const capabilities = (ctx.mcpReq.envelope as Record<string, any> | undefined)?.[
        CLIENT_CAPABILITIES_META_KEY
    ];
    return !!capabilities?.elicitation;
}

function errorResult(err: unknown, env: ToolEnv, tool: string) {
    if (err instanceof RateLimitedException) {
        return toolErrorResult(String(err.message), { retryAfterSeconds: err.retryAfterSeconds });
    }
    if (err instanceof ToolError) return toolErrorResult(err.message, err.data);
    if (err instanceof HttpException) {
        const status = err.getStatus();
        const message = status === 403 ? "Forbidden: you have no MCP access to this" : err.message;
        return toolErrorResult(message, { status });
    }
    env.deps.logger.error("MCP tool failed", {
        tool,
        providerId: env.session.providerId,
        identity: env.session.identityKey,
        error: err instanceof Error ? err.message : String(err),
    });
    return toolErrorResult("Internal error");
}

/**
 * Registers a tool behind the per-identity MCP rate limit, mapping thrown errors to tool errors.
 * Input schemas are strict zod objects: unknown keys are rejected and nothing is coerced.
 */
export function defineTool<S extends z.ZodObject<any>>(
    server: McpServer,
    env: ToolEnv,
    name: string,
    config: { title: string; description: string; inputSchema: S; annotations: ToolAnnotations },
    handler: (args: z.infer<S>, ctx: ServerContext) => Promise<any>,
): void {
    server.registerTool(
        name,
        config as any,
        (async (args: z.infer<S>, ctx: ServerContext) => {
            const gate = env.deps.mcpRateLimiter.check(env.session.identityKey);
            if (!gate.allowed) {
                const retryAfterSeconds = Math.ceil(gate.retryAfterMs / 1000);
                return toolErrorResult(`Too many requests; retry in ${retryAfterSeconds} seconds`, {
                    retryAfterSeconds,
                });
            }
            env.deps.mcpRateLimiter.recordCall(env.session.identityKey);

            try {
                return await handler(args, ctx);
            } catch (err) {
                return errorResult(err, env, name);
            }
        }) as any,
    );
}
