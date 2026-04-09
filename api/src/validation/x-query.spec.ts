import { HttpException } from "@nestjs/common";
import { IsNotEmpty, IsOptional } from "class-validator";
import { xQuery } from "./x-query";

class TestDto {
    @IsNotEmpty()
    name: string;

    @IsOptional()
    optional?: string;
}

describe("xQuery", () => {
    it("should throw HttpException when query is empty", () => {
        expect(() => xQuery("", TestDto)).toThrow(HttpException);
        expect(() => xQuery("", TestDto)).toThrow("X-Query header is required");
    });

    it("should throw HttpException when query is null/undefined", () => {
        expect(() => xQuery(null as any, TestDto)).toThrow(HttpException);
        expect(() => xQuery(undefined as any, TestDto)).toThrow(HttpException);
    });

    it("should throw HttpException for invalid JSON", () => {
        expect(() => xQuery("not json", TestDto)).toThrow(HttpException);
        expect(() => xQuery("not json", TestDto)).toThrow("valid JSON format");
    });

    it("should throw HttpException when validation fails", () => {
        expect(() => xQuery('{"optional": "val"}', TestDto)).toThrow(HttpException);
        expect(() => xQuery('{"optional": "val"}', TestDto)).toThrow("Validation failed");
    });

    it("should return parsed object for valid query", () => {
        const result = xQuery('{"name": "test", "optional": "val"}', TestDto);
        expect(result).toEqual({ name: "test", optional: "val" });
    });

    it("should return parsed object with only required fields", () => {
        const result = xQuery('{"name": "test"}', TestDto);
        expect(result).toEqual({ name: "test" });
    });
});
