import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
    currentTrace,
    PerfTrace,
    perfTraceEnabled,
    runWithTrace,
    serializeTrace,
} from "./perfTrace";

const TRACE_KEY = Symbol("perfTrace");

/**
 * Attach per-request tracing at the Fastify lifecycle rather than as a Nest interceptor:
 * `onRequest` runs before guards, so the auth guard's identity resolution (and the DB
 * round trips it makes) lands inside the same trace.
 */
export function registerPerfTraceHooks(app: NestFastifyApplication): void {
    if (!perfTraceEnabled()) return;

    const fastify = app.getHttpAdapter().getInstance() as unknown as FastifyInstance;

    fastify.addHook("onRequest", (request: FastifyRequest, _reply: FastifyReply, done) => {
        runWithTrace(routeLabel(request), () => {
            (request as any)[TRACE_KEY] = currentTrace();
            done();
        });
    });

    fastify.addHook("onSend", (request: FastifyRequest, reply: FastifyReply, payload, done) => {
        const trace = (request as any)[TRACE_KEY] as PerfTrace | undefined;
        if (trace) {
            if (typeof payload === "string") trace.meta.bytes = Buffer.byteLength(payload);
            else if (Buffer.isBuffer(payload)) trace.meta.bytes = payload.length;
            reply.header("X-Perf-Trace", serializeTrace(trace));
        }
        done(null, payload);
    });
}

function routeLabel(request: FastifyRequest): string {
    const path = (request as any).routeOptions?.url ?? (request as any).routerPath ?? request.url;
    return `${request.method} ${path}`;
}
