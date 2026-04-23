import type { Uuid } from "../dto";
import { DocType } from "../enum";
import type { UserDataBaseDto } from "./UserDataBaseDto";
import type { HighlightEntry } from "./HighlightEntry";

/**
 * All of a user's state for a single piece of content: reading position,
 * highlights, and any future per-content annotations. One doc per
 * (user, content) pair. Deterministic id: {userId}:userContent:{contentId}.
 */
export type UserContentDto = UserDataBaseDto & {
    type: DocType.UserContent;
    contentId: Uuid;
    readingPos?: number;
    highlights?: HighlightEntry[];
};
