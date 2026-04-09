import { HttpException } from "@nestjs/common";
import * as JWT from "jsonwebtoken";
import { validateJWT } from "./jwt";

describe("validateJWT", () => {
    const jwtSecret = "test-secret";
    const logger = { error: jest.fn() } as any;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return the decoded payload for a valid token", () => {
        const token = JWT.sign({ userId: "123" }, jwtSecret);
        const result = validateJWT(token, jwtSecret, logger);

        expect(result).toBeDefined();
        expect((result as JWT.JwtPayload).userId).toBe("123");
    });

    it("should throw HttpException for an invalid token", () => {
        expect(() => validateJWT("invalid-token", jwtSecret, logger)).toThrow(HttpException);
        expect(logger.error).toHaveBeenCalled();
    });

    it("should throw HttpException for a token signed with wrong secret", () => {
        const token = JWT.sign({ userId: "123" }, "wrong-secret");
        expect(() => validateJWT(token, jwtSecret, logger)).toThrow(HttpException);
        expect(logger.error).toHaveBeenCalled();
    });

    it("should return undefined for an empty token", () => {
        const result = validateJWT("", jwtSecret, logger);
        expect(result).toBeUndefined();
    });

    it("should return undefined for a null/undefined token", () => {
        const result = validateJWT(undefined as any, jwtSecret, logger);
        expect(result).toBeUndefined();
    });
});
