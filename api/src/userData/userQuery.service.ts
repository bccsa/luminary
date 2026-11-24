import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtUserDetails } from "../auth/authIdentity.service";
import { UserDataDbService } from "./userDataDb.service";
import { UserDataService } from "./userData.service";
import { isUserActivityType } from "./activityIdentity";

@Injectable()
export class UserQueryService {
    constructor(
        private readonly db: UserDataDbService,
        private readonly config: ConfigService,
        private readonly documents: UserDataService,
    ) {}

    async query(query: any, user: JwtUserDetails) {
        const owner = this.documents.owner(user);
        this.db.assertEnabled();
        if (!isUserActivityType(query?.selector?.type)) {
            throw new BadRequestException("User-data queries require a supported activity type");
        }
        const result = await this.db.partitionedFind(owner, {
            selector: query.selector,
            limit: query.limit ?? this.config.get<number>("query.maxLimit") ?? 500,
            sort: query.sort ?? [{ updatedTimeUtc: "desc" }],
            use_index: query.use_index ?? `sync-${query.selector.type}-index`,
            execution_stats: true,
        });
        // Bookmarks can encode stored ids. The sync protocol uses timestamps, not bookmarks.
        return {
            docs: result.docs.map((doc) => this.documents.toClient(owner, doc)),
            warning: result.warning,
            execution_stats: result.execution_stats,
        };
    }
}
