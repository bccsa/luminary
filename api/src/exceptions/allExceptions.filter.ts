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
 *  2. Passes 4xx `HttpException`s through with their original message.
 *  3. For 5xx / unknown errors, logs the real cause server-side and also
 *     returns it as `message` — clients log/report the real error, and
 *     display their own friendly copy. Never sends `.stack` (paths/queries
 *     may appear there); `.message` is assumed safe to expose.
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

        if (exception instanceof HttpException && exception.getStatus() < 500) {
            const status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            const message =
                typeof exceptionResponse === "string"
                    ? exceptionResponse
                    : (exceptionResponse as { message?: string }).message ?? exception.message;

            response
                .status(status)
                .header("Content-Type", "application/json")
                .send({ statusCode: status, message });
            return;
        }

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        const actualMessage = exception instanceof Error ? exception.message : String(exception);

        this.logger.error(
            `[${request.method} ${request.url}]`,
            exception instanceof Error ? exception.stack ?? actualMessage : exception,
        );

        response
            .status(status)
            .header("Content-Type", "application/json")
            .send({ statusCode: status, message: actualMessage });
    }
}
