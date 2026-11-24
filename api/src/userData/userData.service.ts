import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { UserActivityDto } from "../dto/UserActivityDto";
import { UserDataDbService } from "./userDataDb.service";

/** Source availability and response conversion shared by reads and writes. */
@Injectable()
export class UserDataService {
    constructor(private readonly db: UserDataDbService) {}

    get enabled(): boolean {
        return this.db.enabled;
    }

    toClient(owner: string, doc: UserActivityDto): UserActivityDto {
        const prefix = `${owner}:`;
        if (typeof doc._id !== "string" || !doc._id.startsWith(prefix)) {
            throw new ServiceUnavailableException("Invalid user-data database response");
        }
        const client = { ...doc, _id: doc._id.slice(prefix.length) };
        return client;
    }
}
