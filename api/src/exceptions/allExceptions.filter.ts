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

        let status: number;
        let message: string;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            message =
                typeof exceptionResponse === "string"
                    ? exceptionResponse
                    : (exceptionResponse as any).message || exception.message;
        } else {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            message = "Something went wrong on the server. Please try again in a minute.";
        }

        // For server errors (5xx), always return a user-friendly message
        if (status >= 500) {
            console.error(`[${request.method} ${request.url}]`, exception);

            response.status(status).send({
                statusCode: status,
                message: "Something went wrong on the server. Please try again in a minute.",
            });
            return;
        }

        // For client errors (4xx), return the original message
        response.status(status).send({
            statusCode: status,
            message,
        });
    }
}
