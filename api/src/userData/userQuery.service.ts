import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtUserDetails } from "../auth/authIdentity.service";
import { UserDataDbService } from "./userDataDb.service";
import { UserDataService } from "./userData.service";
import { USER_ACTIVITY_SOURCE, USER_ACTIVITY_TYPES, isUserActivityType } from "./activityIdentity";

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
        const current = query.dataSource === USER_ACTIVITY_SOURCE;
        if (
            current
                ? !isUserActivityType(query?.selector?.type)
                : query?.selector?.type !== "userActivity"
        ) {
            throw new BadRequestException("User-data queries require a supported activity type");
        }
        const selector = {
            ...query.selector,
            type: current ? query.selector.type : { $in: USER_ACTIVITY_TYPES },
        };
        const result = await this.db.partitionedFind(owner, {
            selector,
            limit: query.limit ?? this.config.get<number>("query.maxLimit") ?? 500,
            sort: query.sort ?? [{ updatedTimeUtc: "desc" }],
            use_index:
                query.use_index ??
                (current ? `sync-${query.selector.type}-index` : "sync-userActivity-index"),
            execution_stats: true,
        });
        // Bookmarks can encode stored ids. The sync protocol uses timestamps, not bookmarks.
        return {
            docs: result.docs.map((doc) => this.documents.toClient(owner, doc, current)),
            warning: result.warning,
            execution_stats: result.execution_stats,
        };
    }
}
