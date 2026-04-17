import "reflect-metadata";
import { validateSync } from "class-validator";
import { AutoGroupMappingsDto } from "./AutoGroupMappingsDto";
import { DocType } from "../enums";

describe("AutoGroupMappingsDto", () => {
    function createValid(): AutoGroupMappingsDto {
        const dto = new AutoGroupMappingsDto();
        dto._id = "mapping-1";
        dto.type = DocType.AutoGroupMappings;
        dto.memberOf = ["group-super-admins"];
        dto.groupIds = ["group-editors"];
        dto.conditions = [];
        return dto;
    }

    it("should pass validation with valid data", () => {
        const dto = createValid();
        expect(validateSync(dto)).toHaveLength(0);
    });

    it("should fail when memberOf is empty", () => {
        const dto = createValid();
        dto.memberOf = [];
        const errors = validateSync(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === "memberOf")).toBe(true);
    });

    it("should fail when memberOf contains non-string entries", () => {
        const dto = createValid();
        (dto as any).memberOf = [123];
        const errors = validateSync(dto);
        expect(errors.some((e) => e.property === "memberOf")).toBe(true);
    });

    it("should fail when groupIds is empty", () => {
        const dto = createValid();
        dto.groupIds = [];
        const errors = validateSync(dto);
        expect(errors.some((e) => e.property === "groupIds")).toBe(true);
    });
});
