import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { Expose } from "class-transformer";
import { _baseDto } from "./_baseDto";
import { Uuid } from "../enums";

/**
 * Base DTO for all docs stored in the partitioned userdata database.
 * The `userId` field is the CouchDB partition key — `_id` must start with
 * `{userId}:`. The partition prefix is re-validated at the storage layer
 * regardless of what is claimed here; this field exists to make the
 * ownership explicit on the wire and for Mango selectors.
 */
export class _userDataBaseDto extends _baseDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    public userId: Uuid;

    @IsNumber()
    @Expose()
    public createdAt: number;

    /**
     * Override the base's `updatedTimeUtc` to add `@Expose`. The content
     * pipeline strips this field (server overrides on write), but for
     * user-data we need the client-supplied timestamp to drive LWW
     * conflict resolution across multiple devices — the time the user
     * made the change, not the time the server received the write.
     */
    @IsOptional()
    @IsNumber()
    @Expose()
    public updatedTimeUtc?: number;
}
