import { Injectable, ServiceUnavailableException } from "@nestjs/common";
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
import { UserDataDbService } from "./userDataDb.service";
import { removeEmptyValues } from "../util/removeEmptyValues";
import { LegacyUserActivityDto } from "../dto/LegacyUserActivityDto";
import {
    USER_ACTIVITY_SOURCE,
    isUserActivityType,
    normalizeUserActivityDocument,
    userActivityDocumentId,
} from "./activityIdentity";
import type { ClassConstructor } from "class-transformer";

import { UserDataService } from "./userData.service";

@Injectable()
export class UserChangeRequestService {
    constructor(
        private readonly db: UserDataDbService,
        private readonly documents: UserDataService,
    ) {}

    async changeRequest(
        raw: unknown,
        user: JwtUserDetails,
        source = "user",
    ): Promise<ChangeReqAckDto> {
        const owner = this.documents.owner(user);
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
                      docs: [this.documents.toClient(owner, result.doc, current)],
                  }
                : { ack: AckStatus.Accepted };
        } catch {
            // Database failures are retryable; a rejected ack would discard the queued edit.
            throw new ServiceUnavailableException("Unable to store user activity; retry later");
        }
    }
}
