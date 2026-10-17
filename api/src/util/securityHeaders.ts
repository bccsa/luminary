import type { FastifyInstance } from "fastify";

/** Marks every API response as non-sniffable so a JSON body can never be reinterpreted as HTML/script by a browser. */
export function addSecurityHeaders(fastify: FastifyInstance) {
    fastify.addHook("onSend", async (_request, reply, payload) => {
        reply.header("X-Content-Type-Options", "nosniff");
        return payload;
    });
}
