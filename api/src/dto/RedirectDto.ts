import { IsString } from "class-validator";
import { ContentDto } from "./ContentDto";
import { Expose } from "class-transformer";
import { GroupDto } from "./GroupDto";

export class RedirectDto extends ContentDto {
    @IsString()
    @Expose()
    redirectSlug: string;

    @Expose()
    membership: GroupDto;
}
