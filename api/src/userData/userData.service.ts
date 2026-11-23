import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtUserDetails } from "../auth/authIdentity.service";
import { ownerKey } from "../auth/ownerKey";
import { UserActivityDto } from "../dto/UserActivityDto";
import { LegacyUserActivityDto } from "../dto/LegacyUserActivityDto";
import { toLegacyUserActivityDocument } from "./activityIdentity";
import { UserDataDbService } from "./userDataDb.service";

/** Account-scoped document identity and response conversion shared by reads and writes. */
@Injectable()
export class UserDataService {
    constructor(
        private readonly db: UserDataDbService,
        private readonly config: ConfigService,
    ) {}

    get enabled(): boolean {
        return this.db.enabled;
    }

    owner(user: JwtUserDetails): string {
        return ownerKey(user, this.config.get<string>("userData.idSecret"));
    }

    toClient(
        owner: string,
        doc: UserActivityDto,
        current: boolean,
    ): UserActivityDto | LegacyUserActivityDto {
        const prefix = `${owner}:`;
        if (typeof doc._id !== "string" || !doc._id.startsWith(prefix)) {
            throw new ServiceUnavailableException("Invalid user-data database response");
        }
        const client = { ...doc, _id: doc._id.slice(prefix.length) };
        return current ? client : toLegacyUserActivityDocument(client);
    }
}
