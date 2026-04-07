import "reflect-metadata";
import { validateSync } from "class-validator";
import { ChangeDto } from "./ChangeDto";
import { DocType } from "../enums";

describe("ChangeDto", () => {
    function createValid(): ChangeDto {
        const dto = new ChangeDto();
        dto._id = "change-1";
        dto.type = DocType.Change;
        dto.docId = "doc-1";
        dto.docType = DocType.Post;
        dto.changes = { title: "Test" };
        dto.changedByUser = "user-1";
        return dto;
    }

    it("should pass validation with valid data", () => {
        const dto = createValid();
        expect(validateSync(dto)).toHaveLength(0);
    });

    it("should fail when docId is missing", () => {
        const dto = createValid();
        dto.docId = undefined;
        expect(validateSync(dto).length).toBeGreaterThan(0);
    });

    it("should fail when docType is invalid", () => {
        const dto = createValid();
        dto.docType = "invalid" as any;
        expect(validateSync(dto).length).toBeGreaterThan(0);
    });

    it("should fail when changes is missing", () => {
        const dto = createValid();
        dto.changes = undefined;
        expect(validateSync(dto).length).toBeGreaterThan(0);
    });

    it("should pass with optional memberOf", () => {
        const dto = createValid();
        dto.memberOf = ["group-1"];
        expect(validateSync(dto)).toHaveLength(0);
    });

    it("should pass with optional parentId and language", () => {
        const dto = createValid();
        dto.parentId = "parent-1";
        dto.language = "lang-1";
        expect(validateSync(dto)).toHaveLength(0);
    });
});
