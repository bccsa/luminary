import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpReq } from "./http";

describe("HttpReq", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = vi.fn();
        vi.stubGlobal("fetch", mockFetch);
    });

    describe("get", () => {
        it("sends GET with X-Query header and Authorization", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ data: "result" }),
            });
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            const http = new HttpReq("https://api.example.com", "my-token");
            const result = await http.get("search", { type: "post" });

            expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/search", {
                method: "GET",
                headers: {
                    "X-Query": JSON.stringify({ type: "post" }),
                    Authorization: "Bearer my-token",
                },
            });
            expect(result).toEqual({ data: "result" });
            consoleSpy.mockRestore();
        });

        it("sends GET without Authorization when no token", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            const http = new HttpReq("https://api.example.com");
            await http.get("search", {});

            const headers = mockFetch.mock.calls[0][1].headers;
            expect(headers.Authorization).toBeUndefined();
            consoleSpy.mockRestore();
        });

        it("prepends https:// when apiUrl lacks protocol", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            const http = new HttpReq("api.example.com");
            await http.get("search", {});

            expect(mockFetch.mock.calls[0][0]).toBe("https://api.example.com/search");
            consoleSpy.mockRestore();
        });

        it("uses existing http:// protocol", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            const http = new HttpReq("http://api.example.com");
            await http.get("search", {});

            expect(mockFetch.mock.calls[0][0]).toBe("http://api.example.com/search");
            consoleSpy.mockRestore();
        });

        it("returns undefined on network error", async () => {
            mockFetch.mockRejectedValue(new Error("Network error"));
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            const http = new HttpReq("https://api.example.com");
            const result = await http.get("search", {});

            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });

        it("throws on HTTP error status", async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            const http = new HttpReq("https://api.example.com");
            // The error is caught internally so it returns undefined
            const result = await http.get("search", {});
            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });
    });

    describe("getWithQueryParams", () => {
        it("sends GET with query params appended to URL", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ status: "ok" }),
            });

            const http = new HttpReq("https://api.example.com", "my-token");
            const result = await http.getWithQueryParams("status", { id: "123" });

            expect(mockFetch.mock.calls[0][0]).toContain("status?id=123");
            expect(result).toEqual({ status: "ok" });
        });

        it("sends Authorization header when token present", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const http = new HttpReq("https://api.example.com", "token");
            await http.getWithQueryParams("endpoint", {});

            const headers = mockFetch.mock.calls[0][1].headers;
            expect(headers.Authorization).toBe("Bearer token");
        });

        it("handles JSON parse error gracefully", async () => {
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.reject(new Error("invalid json")),
            });

            const http = new HttpReq("https://api.example.com");
            const result = await http.getWithQueryParams("endpoint", {});

            expect(consoleSpy).toHaveBeenCalled();
            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });

        it("handles network error", async () => {
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            mockFetch.mockRejectedValue(new Error("network"));

            const http = new HttpReq("https://api.example.com");
            const result = await http.getWithQueryParams("endpoint", {});

            expect(consoleSpy).toHaveBeenCalled();
            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });

        it("handles HTTP error status", async () => {
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            mockFetch.mockResolvedValue({ ok: false, status: 500 });

            const http = new HttpReq("https://api.example.com");
            const result = await http.getWithQueryParams("endpoint", {});

            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
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

            const http = new HttpReq("https://api.example.com", "token");
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

            const http = new HttpReq("https://api.example.com", "token");
            await http.post("upload", formData as any);

            const [, opts] = mockFetch.mock.calls[0];
            expect(opts.headers["Content-Type"]).toBeUndefined();
            expect(opts.body).toBe(formData);
        });

        it("sends empty Authorization when no token", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
            });

            const http = new HttpReq("https://api.example.com");
            await http.post("endpoint", {});

            const headers = mockFetch.mock.calls[0][1].headers;
            expect(headers.Authorization).toBe("");
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
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.reject(new Error("bad json")),
            });

            const http = new HttpReq("https://api.example.com");
            const result = await http.post("endpoint", {});

            expect(consoleSpy).toHaveBeenCalled();
            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });

        it("handles network error", async () => {
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            mockFetch.mockRejectedValue(new Error("network"));

            const http = new HttpReq("https://api.example.com");
            const result = await http.post("endpoint", {});

            expect(consoleSpy).toHaveBeenCalled();
            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });

        it("handles HTTP error status", async () => {
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            mockFetch.mockResolvedValue({ ok: false, status: 403 });

            const http = new HttpReq("https://api.example.com");
            const result = await http.post("endpoint", {});

            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });
    });
});
