import { validateSync } from "class-validator";
import { IsStringTranslationRecord } from "./IsStringTranslationRecord";

class TestClass {
    @IsStringTranslationRecord()
    value: string;
}

function validate(value: any) {
    const obj = new TestClass();
    obj.value = value;
    return validateSync(obj);
}

describe("IsStringTranslationRecord", () => {
    it("should pass for a string value", () => {
        expect(validate("hello")).toHaveLength(0);
    });

    it("should pass for an empty string", () => {
        expect(validate("")).toHaveLength(0);
    });

    it("should fail for a number", () => {
        expect(validate(123)).toHaveLength(1);
    });

    it("should fail for an object", () => {
        expect(validate({ en: "hello" })).toHaveLength(1);
    });

    it("should fail for null", () => {
        expect(validate(null)).toHaveLength(1);
    });

    it("should fail for undefined", () => {
        expect(validate(undefined)).toHaveLength(1);
    });
});
