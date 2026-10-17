import Fastify from "fastify";
import { addSecurityHeaders } from "./securityHeaders";

describe("addSecurityHeaders", () => {
    it("sets nosniff on successful and error responses", async () => {
        const app = Fastify();
        addSecurityHeaders(app);
        app.get("/ok", async () => ({ ok: true }));
        app.get("/fail", async () => {
            throw new Error("boom");
        });

        const ok = await app.inject({ method: "GET", url: "/ok" });
        const fail = await app.inject({ method: "GET", url: "/fail" });
        const missing = await app.inject({ method: "GET", url: "/nope" });

        expect(ok.headers["x-content-type-options"]).toBe("nosniff");
        expect(fail.statusCode).toBe(500);
        expect(fail.headers["x-content-type-options"]).toBe("nosniff");
        expect(missing.headers["x-content-type-options"]).toBe("nosniff");
        await app.close();
    });
});
