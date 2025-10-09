import { IsNotEmpty, IsString } from "class-validator";
import { MongoQueryDto } from "./MongoQueryDto";
import { Type } from "class-transformer";

export class FindReqDto {
    @IsNotEmpty()
    @IsString()
    apiVersion: string;

    @IsNotEmpty()
    @Type(() => MongoQueryDto)
    query: MongoQueryDto;
}
