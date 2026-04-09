import { validateApiVersion } from "./apiVersion";

describe("validateApiVersion", () => {
    it("should return true for any version string", async () => {
        // Note: The current implementation has a bug where clientVersion is compared
        // to itself (line 10: clientVersion != clientVersion), making the throw
        // unreachable. The function always returns true.
        const result = await validateApiVersion("1.0.0");
        expect(result).toBe(true);
    });

    it("should return true for an empty string", async () => {
        const result = await validateApiVersion("");
        expect(result).toBe(true);
    });
});
