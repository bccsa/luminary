import "reflect-metadata";
import { IsNotEmpty, IsString } from "class-validator";
import { Expose } from "class-transformer";

export class ImageDuplicateFromDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    docId: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    bucketId: string;
}
