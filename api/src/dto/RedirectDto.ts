import { IsString } from "class-validator";
import { ContentDto } from "./ContentDto";
import { Expose } from "class-transformer";

export class RedirectDto extends ContentDto {
    @IsString()
    @Expose()
    redirectSlug: string;
}
