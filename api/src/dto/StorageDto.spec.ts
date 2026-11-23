import "reflect-metadata";
import { validateSync } from "class-validator";
import { instanceToPlain, plainToInstance } from "class-transformer";
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

    describe("mediaEncoderSettings.blockSeconds", () => {
        // Built the way a change request builds it, implicit conversion included.
        function withBlockSeconds(blockSeconds: unknown): StorageDto {
            return plainToInstance(
                StorageDto,
                {
                    ...instanceToPlain(createValid()),
                    storageType: StorageType.Media,
                    mediaEncoderSettings: { blockSeconds },
                },
                { enableImplicitConversion: true },
            );
        }

        it("accepts 0 to 600 seconds and an absent value", () => {
            for (const value of [undefined, 0, 30, 30.5, 60, 600]) {
                expect(validateSync(withBlockSeconds(value), { whitelist: true })).toHaveLength(0);
            }
        });

        it("rejects a value outside 0 to 600 seconds", () => {
            for (const value of [-1, -0.1, 600.5, 601]) {
                expect(
                    validateSync(withBlockSeconds(value), { whitelist: true }).length,
                ).toBeGreaterThan(0);
            }
        });

        it("keeps 0 apart from an absent value", () => {
            expect(withBlockSeconds(0).mediaEncoderSettings.blockSeconds).toBe(0);
            expect(withBlockSeconds("0").mediaEncoderSettings.blockSeconds).toBe(0);
            expect(withBlockSeconds(undefined).mediaEncoderSettings.blockSeconds).toBeUndefined();
        });

        it("converts a numeric string to its number", () => {
            const dto = withBlockSeconds("60");
            expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
            expect(dto.mediaEncoderSettings.blockSeconds).toBe(60);
        });
    });

    it("should fail when name is missing", () => {
        const dto = createValid();
        dto.name = undefined;
        expect(validateSync(dto).length).toBeGreaterThan(0);
    });
});
