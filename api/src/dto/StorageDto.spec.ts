import "reflect-metadata";
import { validateSync } from "class-validator";
import { StorageDto } from "./StorageDto";
import { DocType, StorageType } from "../enums";

describe("StorageDto", () => {
    function createValid(): StorageDto {
        const dto = new StorageDto();
        dto._id = "storage-1";
        dto.type = DocType.Storage;
        dto.memberOf = ["group-1"];
        dto.name = "test-bucket";
        dto.mimeTypes = ["image/*"];
        dto.publicUrl = "https://cdn.example.com";
        dto.storageType = StorageType.Image;
        return dto;
    }

    it("should pass validation with valid data", () => {
        const dto = createValid();
        expect(validateSync(dto)).toHaveLength(0);
    });

    it("should have default empty mimeTypes array", () => {
        const dto = new StorageDto();
        expect(dto.mimeTypes).toEqual([]);
    });

    it("should pass with optional credential_id", () => {
        const dto = createValid();
        dto.credential_id = "cred-1";
        expect(validateSync(dto)).toHaveLength(0);
    });

    it("should fail when name is missing", () => {
        const dto = createValid();
        dto.name = undefined;
        expect(validateSync(dto).length).toBeGreaterThan(0);
    });
});
