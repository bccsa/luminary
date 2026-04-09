import { validateSync } from "class-validator";
import { DocsReqDto } from "./DocsReqDto";
import { DocType } from "../enums";

describe("DocsReqDto", () => {
    function createValid(): DocsReqDto {
        const dto = new DocsReqDto();
        dto.apiVersion = "1";
        dto.docTypes = [{ type: DocType.Post }];
        dto.type = DocType.Post;
        return dto;
    }

    it("should pass validation with valid data", () => {
        const dto = createValid();
        expect(validateSync(dto)).toHaveLength(0);
    });

    it("should pass with optional gapStart and gapEnd", () => {
        const dto = createValid();
        dto.gapStart = 100;
        dto.gapEnd = 200;
        expect(validateSync(dto)).toHaveLength(0);
    });

    it("should pass with optional contentOnly and group", () => {
        const dto = createValid();
        dto.contentOnly = true;
        dto.group = "group-1";
        expect(validateSync(dto)).toHaveLength(0);
    });
});
