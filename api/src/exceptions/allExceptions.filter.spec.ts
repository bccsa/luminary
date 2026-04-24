import { AllExceptionsFilter } from "./allExceptions.filter";
import { ArgumentsHost, HttpException, HttpStatus, Logger } from "@nestjs/common";

describe("AllExceptionsFilter", () => {
    let filter: AllExceptionsFilter;
    let mockResponse: {
        status: jest.Mock;
        send: jest.Mock;
        header: jest.Mock;
        sent: boolean;
        raw: { writableEnded: boolean };
    };
    let mockRequest: { method: string; url: string };
    let mockHost: ArgumentsHost;
    let loggerErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        filter = new AllExceptionsFilter();
        mockResponse = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis(),
            header: jest.fn().mockReturnThis(),
            sent: false,
            raw: { writableEnded: false },
        };
        mockRequest = { method: "GET", url: "/test" };
        mockHost = {
            switchToHttp: () => ({
                getResponse: () => mockResponse,
                getRequest: () => mockRequest,
            }),
        } as unknown as ArgumentsHost;

        loggerErrorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("returns a user-friendly message for unknown exceptions", () => {
        filter.catch(new Error("db connection failed"), mockHost);

        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(mockResponse.send).toHaveBeenCalledWith({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: "Something went wrong on the server. Please try again in a minute.",
        });
    });

    it("returns a user-friendly message for 5xx HttpExceptions", () => {
        const exception = new HttpException("Service Unavailable", HttpStatus.SERVICE_UNAVAILABLE);

        filter.catch(exception, mockHost);

        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
        expect(mockResponse.send).toHaveBeenCalledWith({
            statusCode: HttpStatus.SERVICE_UNAVAILABLE,
            message: "Something went wrong on the server. Please try again in a minute.",
        });
    });

    it("logs the original exception for 5xx errors with request context", () => {
        const exception = new Error("something broke");

        filter.catch(exception, mockHost);

        expect(loggerErrorSpy).toHaveBeenCalledWith(
            "[GET /test]",
            expect.stringContaining("something broke"),
        );
    });

    it("returns the original message for 4xx HttpExceptions with a string response", () => {
        const exception = new HttpException("Not Found", HttpStatus.NOT_FOUND);

        filter.catch(exception, mockHost);

        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
        expect(mockResponse.send).toHaveBeenCalledWith({
            statusCode: HttpStatus.NOT_FOUND,
            message: "Not Found",
        });
    });

    it("returns the original message for 4xx HttpExceptions with an object response", () => {
        const exception = new HttpException(
            { message: "Validation failed", statusCode: 400 },
            HttpStatus.BAD_REQUEST,
        );

        filter.catch(exception, mockHost);

        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
        expect(mockResponse.send).toHaveBeenCalledWith({
            statusCode: HttpStatus.BAD_REQUEST,
            message: "Validation failed",
        });
    });

    it("does not log 4xx errors", () => {
        const exception = new HttpException("Bad Request", HttpStatus.BAD_REQUEST);

        filter.catch(exception, mockHost);

        expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it("handles non-Error, non-HttpException values as 500", () => {
        filter.catch("some string error", mockHost);

        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(mockResponse.send).toHaveBeenCalledWith({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: "Something went wrong on the server. Please try again in a minute.",
        });
    });

    it("sets Content-Type application/json on the response", () => {
        filter.catch(new Error("boom"), mockHost);

        expect(mockResponse.header).toHaveBeenCalledWith("Content-Type", "application/json");
    });

    it("silently swallows ERR_STREAM_PREMATURE_CLOSE without logging or responding", () => {
        const exception = Object.assign(new Error("premature close"), {
            code: "ERR_STREAM_PREMATURE_CLOSE",
        });

        filter.catch(exception, mockHost);

        expect(mockResponse.status).not.toHaveBeenCalled();
        expect(mockResponse.send).not.toHaveBeenCalled();
        expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it("does not write to a response that has already been sent", () => {
        mockResponse.sent = true;

        filter.catch(new Error("late error"), mockHost);

        expect(mockResponse.status).not.toHaveBeenCalled();
        expect(mockResponse.send).not.toHaveBeenCalled();
    });

    it("does not write to a response whose raw socket has ended", () => {
        mockResponse.raw.writableEnded = true;

        filter.catch(new Error("socket gone"), mockHost);

        expect(mockResponse.status).not.toHaveBeenCalled();
        expect(mockResponse.send).not.toHaveBeenCalled();
    });
});
