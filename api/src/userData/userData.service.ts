import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { instanceToPlain, plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { JwtUserDetails } from "../auth/authIdentity.service";
import { UserActivityDto } from "../dto/UserActivityDto";
import { ChangeReqAckDto } from "../dto/ChangeReqAckDto";
import { AckStatus } from "../enums";
import { ownerKey } from "../auth/ownerKey";
import { UserDataDbService } from "./userDataDb.service";
import { removeEmptyValues } from "../util/removeEmptyValues";

@Injectable()
export class UserDataService {
    constructor(
        private readonly db: UserDataDbService,
        private readonly config: ConfigService,
    ) {}

    get enabled(): boolean {
        return this.db.enabled;
    }

    private owner(user: JwtUserDetails): string {
        return ownerKey(user, this.config.get<string>("userData.idSecret"));
    }

    async query(query: any, user: JwtUserDetails) {
        const owner = this.owner(user);
        this.db.assertEnabled();
        if (query?.selector?.type !== "userActivity") {
            throw new BadRequestException("User-data queries require type userActivity");
        }
        const result = await this.db.partitionedFind(owner, {
            selector: query.selector,
            limit: query.limit ?? this.config.get<number>("query.maxLimit") ?? 500,
            sort: query.sort ?? [{ updatedTimeUtc: "desc" }],
            use_index: query.use_index ?? "sync-userActivity-index",
            execution_stats: true,
        });
        // Bookmarks can encode stored ids. The sync protocol uses timestamps, not bookmarks.
        return {
            docs: result.docs.map((doc) => this.toClient(owner, doc)),
            warning: result.warning,
            execution_stats: result.execution_stats,
        };
    }

    async changeRequest(raw: unknown, user: JwtUserDetails): Promise<ChangeReqAckDto> {
        const owner = this.owner(user);
        // An unavailable source must preserve the client's queue, including invalid queued docs.
        this.db.assertEnabled();
        const rejected = (message: string): ChangeReqAckDto => ({
            ack: AckStatus.Rejected,
            message,
        });
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            return rejected("Invalid user activity document");
        const doc = plainToInstance(UserActivityDto, raw);
        const errors = await validate(doc, { whitelist: true, forbidNonWhitelisted: false });
        if (errors.length || !doc._id.startsWith(`${doc.activityType}:`)) {
            return rejected("Invalid user activity document");
        }
        if (doc.activityType === "highlighted") {
            if (!doc.contentId || (!doc.deleted && !doc.payload?.range)) {
                return rejected("A highlight requires a content id and passage");
            }
            if (doc.payload?.range && doc.payload.range.end <= doc.payload.range.start) {
                return rejected("Invalid highlight passage offsets");
            }
        } else if (doc.payload != null) {
            return rejected("Only highlights may carry a passage");
        }
        doc.activityTimeUtc = Math.min(doc.activityTimeUtc, Date.now());
        const clean = instanceToPlain(doc, { excludeExtraneousValues: true }) as UserActivityDto;
        removeEmptyValues(clean);
        try {
            const result = await this.db.upsert(owner, clean);
            return result.stale
                ? {
                      ack: AckStatus.Rejected,
                      message: "A newer activity is already stored",
                      docs: [this.toClient(owner, result.doc)],
                  }
                : { ack: AckStatus.Accepted };
        } catch {
            // Database failures are retryable; a rejected ack would discard the queued edit.
            throw new ServiceUnavailableException("Unable to store user activity; retry later");
        }
    }

    private toClient(owner: string, doc: UserActivityDto): UserActivityDto {
        const prefix = `${owner}:`;
        if (typeof doc._id !== "string" || !doc._id.startsWith(prefix)) {
            throw new ServiceUnavailableException("Invalid user-data database response");
        }
        return { ...doc, _id: doc._id.slice(prefix.length) };
    }
}
