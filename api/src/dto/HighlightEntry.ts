import { IsNotEmpty, IsNumber, IsString } from "class-validator";
import { Expose } from "class-transformer";

/**
 * A single highlight, stored inline inside UserContentDto.highlights.
 * The `id` is unique within the parent doc and is the key the server uses
 * for merge-on-write (union-by-id across concurrent device edits).
 */
export class HighlightEntry {
    @IsNotEmpty()
    @IsString()
    @Expose()
    public id: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    public color: string;

    @IsNotEmpty()
    @IsString()
    @Expose()
    public text: string;

    @IsNumber()
    @Expose()
    public position: number;

    @IsNumber()
    @Expose()
    public createdAt: number;
}
