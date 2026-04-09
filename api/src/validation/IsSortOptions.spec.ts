import { validateSync } from "class-validator";
import { IsSortOptions } from "./IsSortOptions";

class TestClass {
    @IsSortOptions()
    sort: Array<{ [key: string]: "asc" | "desc" }>;
}

function validate(value: any) {
    const obj = new TestClass();
    obj.sort = value;
    return validateSync(obj);
}

describe("IsSortOptions", () => {
    it("should pass for valid single sort option", () => {
        expect(validate([{ field: "asc" }])).toHaveLength(0);
    });

    it("should pass for valid multiple sort entries", () => {
        expect(validate([{ a: "asc" }, { b: "desc" }])).toHaveLength(0);
    });

    it("should pass for empty array", () => {
        expect(validate([])).toHaveLength(0);
    });

    it("should fail for non-array value", () => {
        expect(validate("not-array")).toHaveLength(1);
    });

    it("should fail for invalid direction", () => {
        expect(validate([{ field: "invalid" }])).toHaveLength(1);
    });

    it("should fail for multiple keys per item", () => {
        expect(validate([{ a: "asc", b: "desc" }])).toHaveLength(1);
    });

    it("should fail for null value", () => {
        expect(validate(null)).toHaveLength(1);
    });
});
