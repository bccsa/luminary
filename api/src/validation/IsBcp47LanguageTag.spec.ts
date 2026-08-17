import { validateSync } from "class-validator";
import { IsBcp47LanguageTag } from "./IsBcp47LanguageTag";

class TestClass {
    @IsBcp47LanguageTag()
    value: string;
}

function validate(value: any) {
    const obj = new TestClass();
    obj.value = value;
    return validateSync(obj);
}

describe("IsBcp47LanguageTag", () => {
    it("should pass for a two-letter language code", () => {
        expect(validate("en")).toHaveLength(0);
    });

    it("should pass for a language-region tag", () => {
        expect(validate("en-US")).toHaveLength(0);
    });

    it("should pass for a language-script-region tag", () => {
        expect(validate("zh-Hans-CN")).toHaveLength(0);
    });

    it("should fail for an empty string", () => {
        expect(validate("")).toHaveLength(1);
    });

    it("should fail for an invalid tag", () => {
        expect(validate("not a valid tag")).toHaveLength(1);
    });

    it("should fail for a number", () => {
        expect(validate(123)).toHaveLength(1);
    });

    it("should fail for null", () => {
        expect(validate(null)).toHaveLength(1);
    });

    it("should fail for undefined", () => {
        expect(validate(undefined)).toHaveLength(1);
    });
});
