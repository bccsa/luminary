import { HttpException, HttpStatus } from "@nestjs/common";
import { validateSync } from "class-validator";

export const xQuery = (query: string, ReqDTO: any) => {
    if (!query) {
        throw new HttpException(`X-Query header is required`, HttpStatus.BAD_REQUEST);
    }
    let queryObj;
    try {
        queryObj = JSON.parse(query);
    } catch {
        throw new HttpException(`X-Query has to be of a valid JSON format`, HttpStatus.BAD_REQUEST);
    }
    const reqDto = Object.assign(new ReqDTO(), queryObj);
    const errors = validateSync(reqDto);
    if (errors.length > 0) {
        throw new HttpException(`Validation failed: ${errors}`, HttpStatus.BAD_REQUEST);
    }

    return queryObj;
};
