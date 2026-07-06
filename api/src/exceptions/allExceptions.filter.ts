import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";

/**
 * Global exception filter that:
 *  1. Silently swallows `ERR_STREAM_PREMATURE_CLOSE` — fires when the client
 *     aborts mid-response and is noise, not a real failure.
 *  2. Passes `HttpException`s through with their original message, regardless
 *     of status — these are deliberately authored by our own code, so the
 *     text is safe to expose.
 *  3. For anything else (unexpected errors, ours or a dependency's), logs the
 *     real cause server-side (never `.stack` to the client — paths/queries
 *     may appear there) but returns a generic message. An arbitrary Error's
 *     `.message` was never vetted for client exposure and may contain
 *     internals (e.g. a DB connection string).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const code = (exception as { code?: string } | undefined)?.code;
        if (code === "ERR_STREAM_PREMATURE_CLOSE") return;

        const ctx = host.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        const request = ctx.getRequest<FastifyRequest>();

        if (response.sent || response.raw?.writableEnded) return;

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            const message =
                typeof exceptionResponse === "string"
                    ? exceptionResponse
                    : (exceptionResponse as { message?: string }).message ?? exception.message;

            if (status >= 500) {
                this.logger.error(`[${request.method} ${request.url}]`, exception.stack ?? message);
            }

            response
                .status(status)
                .header("Content-Type", "application/json")
                .send({ statusCode: status, message });
            return;
        }

        this.logger.error(
            `[${request.method} ${request.url}]`,
            exception instanceof Error ? exception.stack ?? exception.message : exception,
        );

        response
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .header("Content-Type", "application/json")
            .send({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: "Internal server error" });
    }
}
