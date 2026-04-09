import { validateSync } from "class-validator";
import { SearchReqDto } from "./SearchReqDto";
import { DocType } from "../enums";

describe("SearchReqDto", () => {
    function createValid(): SearchReqDto {
        const dto = new SearchReqDto();
        dto.apiVersion = "1";
        return dto;
    }

    it("should pass validation with minimal data", () => {
        const dto = createValid();
        expect(validateSync(dto)).toHaveLength(0);
    });

    it("should pass with sort options", () => {
        const dto = createValid();
        dto.sort = [{ updatedTimeUtc: "desc" }];
        expect(validateSync(dto)).toHaveLength(0);
    });

    it("should pass with all optional fields", () => {
        const dto = createValid();
        dto.limit = 10;
        dto.offset = 0;
        dto.groups = ["group-1"];
        dto.types = [DocType.Post];
        dto.contentOnly = false;
        dto.queryString = "search term";
        dto.from = 1000;
        dto.to = 2000;
        dto.languages = ["lang-1"];
        dto.includeDeleteCmds = true;
        dto.docId = "doc-1";
        dto.slug = "test-slug";
        dto.parentId = "parent-1";
        expect(validateSync(dto)).toHaveLength(0);
    });

    it("should fail with invalid sort options", () => {
        const dto = createValid();
        dto.sort = [{ a: "asc", b: "desc" }] as any;
        expect(validateSync(dto).length).toBeGreaterThan(0);
    });
});
