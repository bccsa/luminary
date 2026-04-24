import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";

/**
 * Global exception filter that catches all unhandled exceptions and returns
 * user-friendly error messages for server-side errors (5xx).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<FastifyReply>();
        const request = ctx.getRequest<FastifyRequest>();

        // For known HTTP exceptions with a client error status, return the original message
        if (exception instanceof HttpException && exception.getStatus() < 500) {
            const status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            const message =
                typeof exceptionResponse === "string"
                    ? exceptionResponse
                    : (exceptionResponse as any).message || exception.message;

            response.status(status).send({
                statusCode: status,
                message,
            });
            return;
        }

        // For all other errors (5xx or unknown), return a user-friendly message
        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        console.error(`[${request.method} ${request.url}]`, exception);

        response.status(status).send({
            statusCode: status,
            message: "Something went wrong on the server. Please try again in a minute.",
        });
    }
}
