import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpReq, setCustomHeader, removeCustomHeader } from "./http";
import { serverError } from "../config";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(status: number, body?: object, statusText = "") {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText,
        json:
            body !== undefined
                ? () => Promise.resolve(body)
                : () => Promise.reject(new Error("no body")),
    } as unknown as Response;
}

describe("HttpReq", () => {
    beforeEach(() => {
        mockFetch.mockReset();
        serverError.value = null;
        removeCustomHeader("Authorization");
        removeCustomHeader("x-auth-provider-id");
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("get", () => {
        it("sends GET with X-Query header and custom headers", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: "result" }),
            });

            setCustomHeader("Authorization", "Bearer my-token");
            const http = new HttpReq("https://api.example.com");
            const result = await http.get("search", { type: "post" });

            expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/search", {
                method: "GET",
                headers: {
                    "X-Query": JSON.stringify({ type: "post" }),
                    Authorization: "Bearer my-token",
                },
            });
            expect(result).toEqual({ data: "result" });
        });

        it("sends GET without Authorization when no custom header set", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const http = new HttpReq("https://api.example.com");
            await http.get("search", {});

            const headers = mockFetch.mock.calls[0][1].headers;
            expect(headers.Authorization).toBeUndefined();
        });

        it("prepends https:// when apiUrl lacks protocol", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const http = new HttpReq("api.example.com");
            await http.get("search", {});

            expect(mockFetch.mock.calls[0][0]).toBe("https://api.example.com/search");
        });

        it("uses existing http:// protocol", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const http = new HttpReq("http://api.example.com");
            await http.get("search", {});

            expect(mockFetch.mock.calls[0][0]).toBe("http://api.example.com/search");
        });

        it("returns undefined on network error", async () => {
            mockFetch.mockRejectedValue(new Error("Network error"));

            const http = new HttpReq("https://api.example.com");
            const result = await http.get("search", {});

            expect(result).toBeUndefined();
        });

        it("returns undefined on HTTP error status", async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });

            const http = new HttpReq("https://api.example.com");
            const result = await http.get("search", {});
            expect(result).toBeUndefined();
        });

        it("sets serverError for 5xx responses", async () => {
            mockFetch.mockResolvedValue(mockResponse(503, {}));

            const http = new HttpReq<{ selector: object }>("https://api.example.com");
            const result = await http.get("endpoint", { selector: {} });

            expect(result).toBeUndefined();
            expect(serverError.value).toEqual({ status: 503, message: undefined });
        });
    });

    describe("getWithQueryParams", () => {
        it("sends GET with query params appended to URL", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ status: "ok" }),
            });

            setCustomHeader("Authorization", "Bearer my-token");
            const http = new HttpReq("https://api.example.com");
            const result = await http.getWithQueryParams("status", { id: "123" });

            expect(mockFetch.mock.calls[0][0]).toContain("status?id=123");
            expect(result).toEqual({ status: "ok" });
        });

        it("sends Authorization header when custom header set", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            setCustomHeader("Authorization", "Bearer token");
            const http = new HttpReq("https://api.example.com");
            await http.getWithQueryParams("endpoint", {});

            const headers = mockFetch.mock.calls[0][1].headers;
            expect(headers.Authorization).toBe("Bearer token");
        });

        it("handles JSON parse error gracefully", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.reject(new Error("invalid json")),
            });

            const http = new HttpReq("https://api.example.com");
            const result = await http.getWithQueryParams("endpoint", {});

            expect(console.log).toHaveBeenCalled();
            expect(result).toBeUndefined();
        });

        it("handles network error", async () => {
            mockFetch.mockRejectedValue(new Error("network"));

            const http = new HttpReq("https://api.example.com");
            const result = await http.getWithQueryParams("endpoint", {});

            expect(console.log).toHaveBeenCalled();
            expect(result).toBeUndefined();
        });

        it("sets serverError for 5xx responses", async () => {
            mockFetch.mockResolvedValue(mockResponse(502, { message: "Bad Gateway" }));

            const http = new HttpReq("https://api.example.com");
            const result = await http.getWithQueryParams("search", { q: "test" });

            expect(result).toBeUndefined();
            expect(serverError.value).toEqual({ status: 502, message: "Bad Gateway" });
        });

        it("returns undefined for 4xx responses without setting serverError", async () => {
            mockFetch.mockResolvedValue(mockResponse(401, undefined, "Unauthorized"));

            const http = new HttpReq("https://api.example.com");
            const result = await http.getWithQueryParams("search", { q: "test" });

            expect(result).toBeUndefined();
            expect(serverError.value).toBeNull();
        });

        it("prepends https:// when apiUrl lacks protocol", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const http = new HttpReq("api.example.com");
            await http.getWithQueryParams("endpoint", {});

            expect(mockFetch.mock.calls[0][0]).toContain("https://api.example.com/endpoint");
        });
    });

    describe("post", () => {
        it("sends POST with JSON body and Content-Type header", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ id: 1 }),
            });

            setCustomHeader("Authorization", "Bearer token");
            const http = new HttpReq("https://api.example.com");
            const result = await http.post("changerequest", { type: "post" });

            const [url, opts] = mockFetch.mock.calls[0];
            expect(url).toBe("https://api.example.com/changerequest");
            expect(opts.method).toBe("POST");
            expect(opts.headers["Content-Type"]).toBe("application/json");
            expect(opts.headers.Authorization).toBe("Bearer token");
            expect(opts.body).toBe(JSON.stringify({ type: "post" }));
            expect(result).toEqual({ id: 1 });
        });

        it("sends POST with FormData (no Content-Type)", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const formData = new FormData();
            formData.append("key", "value");

            setCustomHeader("Authorization", "Bearer token");
            const http = new HttpReq("https://api.example.com");
            await http.post("upload", formData as any);

            const [, opts] = mockFetch.mock.calls[0];
            expect(opts.headers["Content-Type"]).toBeUndefined();
            expect(opts.body).toBe(formData);
        });

        it("sends no Authorization header when no custom header set", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const http = new HttpReq("https://api.example.com");
            await http.post("endpoint", {});

            const headers = mockFetch.mock.calls[0][1].headers;
            expect(headers.Authorization).toBeUndefined();
        });

        it("prepends https:// when needed", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const http = new HttpReq("api.example.com");
            await http.post("endpoint", {});

            expect(mockFetch.mock.calls[0][0]).toBe("https://api.example.com/endpoint");
        });

        it("handles JSON parse error gracefully", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.reject(new Error("bad json")),
            });

            const http = new HttpReq("https://api.example.com");
            const result = await http.post("endpoint", {});

            expect(console.log).toHaveBeenCalled();
            expect(result).toBeUndefined();
        });

        it("handles network error", async () => {
            mockFetch.mockRejectedValue(new Error("network"));

            const http = new HttpReq("https://api.example.com");
            const result = await http.post("endpoint", {});

            expect(console.log).toHaveBeenCalled();
            expect(result).toBeUndefined();
        });
    });

    describe("handleResponse via post", () => {
        let http: HttpReq<{ selector: object }>;

        beforeEach(() => {
            http = new HttpReq("https://api.example.com");
        });

        it("returns parsed JSON for successful responses", async () => {
            mockFetch.mockResolvedValue(mockResponse(200, { data: "ok" }));

            const result = await http.post("endpoint", { selector: {} });

            expect(result).toEqual({ data: "ok" });
        });

        it("sets serverError for 5xx responses with a message body", async () => {
            mockFetch.mockResolvedValue(
                mockResponse(500, { message: "Database connection failed" }),
            );

            const result = await http.post("endpoint", { selector: {} });

            expect(result).toBeUndefined();
            expect(serverError.value).toEqual({
                status: 500,
                message: "Database connection failed",
            });
        });

        it("sets serverError without a message for 5xx responses without a parseable body", async () => {
            mockFetch.mockResolvedValue(mockResponse(500));

            const result = await http.post("endpoint", { selector: {} });

            expect(result).toBeUndefined();
            expect(serverError.value).toEqual({ status: 500, message: undefined });
        });

        it("returns undefined for 4xx responses without setting serverError", async () => {
            mockFetch.mockResolvedValue(mockResponse(404, undefined, "Not Found"));

            const result = await http.post("endpoint", { selector: {} });

            expect(result).toBeUndefined();
            expect(serverError.value).toBeNull();
        });

        it("logs the status as a warning for 4xx responses", async () => {
            mockFetch.mockResolvedValue(mockResponse(400, undefined, "Bad Request"));

            await http.post("endpoint", { selector: {} });

            expect(console.warn).toHaveBeenCalledWith("HTTP error: 400 Bad Request");
        });

        it("does not set serverError for 4xx responses", async () => {
            mockFetch.mockResolvedValue(mockResponse(403, undefined, "Forbidden"));

            await http.post("endpoint", { selector: {} });

            expect(serverError.value).toBeNull();
        });
    });

    describe("network errors", () => {
        it("returns undefined when fetch throws (offline mode)", async () => {
            mockFetch.mockRejectedValue(new Error("Failed to fetch"));

            const http = new HttpReq<{ selector: object }>("https://api.example.com");
            const result = await http.post("endpoint", { selector: {} });

            expect(result).toBeUndefined();
            expect(serverError.value).toBeNull();
        });
    });

    describe("setCustomHeader/removeCustomHeader", () => {
        it("includes custom headers on requests and removes them when cleared", async () => {
            mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

            setCustomHeader("x-auth-provider-id", "provider-123");
            const http = new HttpReq("https://api.example.com");
            await http.post("endpoint", {});

            expect(mockFetch.mock.calls[0][1].headers["x-auth-provider-id"]).toBe("provider-123");

            removeCustomHeader("x-auth-provider-id");
            await http.post("endpoint", {});

            expect(mockFetch.mock.calls[1][1].headers["x-auth-provider-id"]).toBeUndefined();
        });
    });
});
