import "reflect-metadata";
import { validateSync } from "class-validator";
import { DeleteCmdDto } from "./DeleteCmdDto";
import { DeleteReason, DocType } from "../enums";

describe("DeleteCmdDto", () => {
    function createValid(): DeleteCmdDto {
        const dto = new DeleteCmdDto();
        dto._id = "del-1";
        dto.type = DocType.DeleteCmd;
        dto.docId = "doc-1";
        dto.docType = DocType.Post;
        dto.deleteReason = DeleteReason.Deleted;
        return dto;
    }

    it("should pass validation with valid required fields", () => {
        const dto = createValid();
        expect(validateSync(dto)).toHaveLength(0);
    });

    it("should fail when docId is missing", () => {
        const dto = createValid();
        dto.docId = undefined;
        expect(validateSync(dto).length).toBeGreaterThan(0);
    });

    it("should pass with optional language and slug", () => {
        const dto = createValid();
        dto.language = "lang-1";
        dto.slug = "my-post";
        expect(validateSync(dto)).toHaveLength(0);
    });
});
