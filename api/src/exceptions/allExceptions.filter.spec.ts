import { AllExceptionsFilter } from "./allExceptions.filter";
import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";

describe("AllExceptionsFilter", () => {
    let filter: AllExceptionsFilter;
    let mockResponse: { status: jest.Mock; send: jest.Mock };
    let mockRequest: { method: string; url: string };
    let mockHost: ArgumentsHost;

    beforeEach(() => {
        filter = new AllExceptionsFilter();
        mockResponse = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
        };
        mockRequest = { method: "GET", url: "/test" };
        mockHost = {
            switchToHttp: () => ({
                getResponse: () => mockResponse,
                getRequest: () => mockRequest,
            }),
        } as unknown as ArgumentsHost;

        jest.spyOn(console, "error").mockImplementation(() => {});
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

    it("logs the original exception for 5xx errors", () => {
        const exception = new Error("something broke");

        filter.catch(exception, mockHost);

        expect(console.error).toHaveBeenCalledWith("[GET /test]", exception);
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

    it("does not log 4xx errors to console.error", () => {
        const exception = new HttpException("Bad Request", HttpStatus.BAD_REQUEST);

        filter.catch(exception, mockHost);

        expect(console.error).not.toHaveBeenCalled();
    });

    it("handles non-Error, non-HttpException values as 500", () => {
        filter.catch("some string error", mockHost);

        expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(mockResponse.send).toHaveBeenCalledWith({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: "Something went wrong on the server. Please try again in a minute.",
        });
    });
});
