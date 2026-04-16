import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from "@nestjs/common";
import { FastifyReply } from "fastify";

/**
 * Global exception filter that:
 *  1. Silently swallows `ERR_STREAM_PREMATURE_CLOSE` errors — these fire when a
 *     client aborts a request mid-response and are noise, not real failures.
 *  2. Delegates everything else to a standard JSON error response so Fastify
 *     never gets confused about the reply content-type.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const code = (exception as { code?: string } | undefined)?.code;

        // Benign: client went away before we finished writing the response.
        if (code === "ERR_STREAM_PREMATURE_CLOSE") return;

        const ctx = host.switchToHttp();
        const reply = ctx.getResponse<FastifyReply>();

        // Don't try to write anything if the socket is already gone.
        if (reply.sent || reply.raw.writableEnded) return;

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        const message =
            exception instanceof HttpException
                ? exception.getResponse()
                : exception instanceof Error
                  ? exception.message
                  : "Internal server error";

        if (status >= 500) {
            this.logger.error(
                exception instanceof Error ? exception.stack ?? exception.message : exception,
            );
        }

        reply
            .status(status)
            .header("Content-Type", "application/json")
            .send(
                typeof message === "string"
                    ? { statusCode: status, message }
                    : { statusCode: status, ...(message as object) },
            );
    }
}
