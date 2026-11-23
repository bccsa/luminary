import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { instanceToPlain, plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { JwtUserDetails } from "../auth/authIdentity.service";
import {
    UserActivityDto,
    BaseUserActivityDto,
    USER_ACTIVITY_DTO_CLASSES,
} from "../dto/UserActivityDto";
import { ChangeReqAckDto } from "../dto/ChangeReqAckDto";
import { AckStatus, UserActivityType } from "../enums";
import { ownerKey } from "../auth/ownerKey";
import { UserDataDbService } from "./userDataDb.service";
import { removeEmptyValues } from "../util/removeEmptyValues";
import { LegacyUserActivityDto } from "../dto/LegacyUserActivityDto";
import {
    USER_ACTIVITY_SOURCE,
    USER_ACTIVITY_TYPES,
    isUserActivityType,
    normalizeUserActivityDocument,
    toLegacyUserActivityDocument,
    userActivityDocumentId,
} from "./activityIdentity";
import type { ClassConstructor } from "class-transformer";

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
            docs: result.docs.map((doc) => this.toClient(owner, doc, current)),
            warning: result.warning,
            execution_stats: result.execution_stats,
        };
    }

    async changeRequest(
        raw: unknown,
        user: JwtUserDetails,
        source = "user",
    ): Promise<ChangeReqAckDto> {
        const owner = this.owner(user);
        // An unavailable source must preserve the client's queue, including invalid queued docs.
        this.db.assertEnabled();
        const rejected = (message: string): ChangeReqAckDto => ({
            ack: AckStatus.Rejected,
            message,
        });
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            return rejected("Invalid user activity document");
        let input: unknown = raw;
        const current = source === USER_ACTIVITY_SOURCE;
        if (!current) {
            const legacy = plainToInstance(LegacyUserActivityDto, raw);
            const errors = await validate(legacy, { whitelist: true, forbidNonWhitelisted: false });
            if (errors.length || !legacy._id.startsWith(`${legacy.activityType}:`))
                return rejected("Invalid user activity document");
            if (legacy.activityType !== "highlighted" && legacy.payload != null)
                return rejected("Only highlights may carry a passage");
            try {
                input = normalizeUserActivityDocument(legacy);
            } catch {
                return rejected("Invalid highlight passage identity");
            }
        }
        const type = (input as { type?: unknown }).type;
        if (!isUserActivityType(type)) return rejected("Invalid user activity type");
        const dtoClass = USER_ACTIVITY_DTO_CLASSES[type] as ClassConstructor<BaseUserActivityDto>;
        const doc = plainToInstance(dtoClass, input) as UserActivityDto;
        const errors = await validate(doc, { whitelist: true, forbidNonWhitelisted: false });
        if (errors.length) return rejected("Invalid user activity document");
        if (doc.type === UserActivityType.Highlighted) {
            if (doc.range.end <= doc.range.start)
                return rejected("Invalid highlight passage offsets");
            if (!doc.deleted && (doc.range.color == null || doc.range.text == null))
                return rejected("A highlight requires a color and quoted text");
        }
        if (doc._id !== userActivityDocumentId(doc))
            return rejected("Invalid user activity identity");
        if (doc.type === UserActivityType.Highlighted && doc.deleted) {
            doc.range = { start: doc.range.start, end: doc.range.end };
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
                      docs: [this.toClient(owner, result.doc, current)],
                  }
                : { ack: AckStatus.Accepted };
        } catch {
            // Database failures are retryable; a rejected ack would discard the queued edit.
            throw new ServiceUnavailableException("Unable to store user activity; retry later");
        }
    }

    private toClient(
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
