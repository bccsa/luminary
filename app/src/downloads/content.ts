import {
    DocType,
    PublishStatus,
    type AccessMap,
    type BaseDocumentDto,
    type ContentDto,
} from "luminary-shared";
import type {
    DownloadContentSnapshot,
    DownloadEntry,
} from "@/build-time/contracts/downloads/contract";
import { isYouTubeLink } from "@/util/youtube";
import { mediaSourceFor } from "@/util/mediaSource";
import { isAccessMapLoaded, mayDownload, type DownloadsDeps } from "./deps";

const known = (groups: readonly string[] | undefined) => (groups?.length ? groups : undefined);

/**
 * The parent's groups as the device holds them. Content docs carry their parent's `memberOf`, so among the content's
 * own stored copy, the stored translations of the parent and a stored parent doc, the one updated last tells today's
 * groups. Undefined when none is stored: an empty list would deny everything.
 */
export async function storedGroups(
    deps: Pick<DownloadsDeps, "getLocalDoc" | "getLocalTranslations">,
    parentId: string,
    contentId?: string,
): Promise<readonly string[] | undefined> {
    const [own, translations, parent] = await Promise.all([
        contentId
            ? deps.getLocalDoc<ContentDto>(contentId).catch(() => undefined)
            : Promise.resolve(undefined),
        deps.getLocalTranslations(parentId).catch((): ContentDto[] => []),
        deps.getLocalDoc(parentId).catch(() => undefined),
    ]);
    let newest: BaseDocumentDto | undefined;
    // In this order, so on a tie the content's own copy wins, then a translation.
    for (const doc of [own, ...translations, parent]) {
        if (!doc || !known(doc.memberOf)) continue;
        if (!newest || doc.updatedTimeUtc > newest.updatedTimeUtc) newest = doc;
    }
    return newest?.memberOf;
}

/** Two group lists hold the same groups. */
export function sameGroups(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((group) => b.includes(group));
}

/** Stand-ins built from a snapshot: they play and can be managed, but never stream and never start a download. */
const standIns = new WeakSet<ContentDto>();

export function isStandIn(content: ContentDto): boolean {
    return standIns.has(content);
}

/**
 * A `ContentDto` for a download whose content doc is not on the device, built from what was kept with it, so the
 * item can still be listed, played and managed. Its media names no online master.
 */
export function contentFromSnapshot(entry: DownloadEntry): ContentDto {
    const snapshot = entry.content;
    const content: ContentDto = {
        _id: snapshot.contentId,
        type: DocType.Content,
        updatedTimeUtc: entry.updatedAt,
        parentId: entry.parentId,
        parentType: entry.parentType === "tag" ? DocType.Tag : DocType.Post,
        language: snapshot.language,
        status: PublishStatus.Published,
        title: snapshot.title,
        slug: snapshot.slug ?? "",
        memberOf: [...snapshot.memberOf],
        parentTags: [],
        parentMedia: {},
        ...(snapshot.author ? { author: snapshot.author } : {}),
        ...(snapshot.publishDate !== undefined ? { publishDate: snapshot.publishDate } : {}),
    };
    standIns.add(content);
    return content;
}

/** The content as the download keeps it; `memberOf` holds the parent's groups, for access checks without the doc. */
export function snapshotFor(
    content: ContentDto,
    parentGroups: readonly string[],
): DownloadContentSnapshot {
    const thumbHash = content.parentImageData?.fileCollections?.find((c) => c.thumbHash)?.thumbHash;
    const mediaId = mediaSourceFor(content);
    return {
        title: content.title,
        contentId: content._id,
        language: content.language,
        memberOf: [...parentGroups],
        // The engine fills it in from the media itself.
        durationSeconds: 0,
        ...(content.author ? { author: content.author } : {}),
        ...(content.slug ? { slug: content.slug } : {}),
        ...(thumbHash ? { thumbHash } : {}),
        ...(content.publishDate !== undefined ? { publishDate: content.publishDate } : {}),
        ...(mediaId ? { mediaId } : {}),
    };
}

/** The encoded HLS media of the content's parent, when it has one a download can be made of. */
export function hasDownloadableMedia(content: ContentDto): boolean {
    const url = content.parentMedia?.hlsUrl;
    return Boolean(url) && !isYouTubeLink(url) && !isStandIn(content);
}

/**
 * Whether `content` may be downloaded now. A live stream cannot be told from its doc; its playlist is refused when the
 * sheet asks for the options.
 */
export function isEligible(
    content: ContentDto | undefined,
    parentGroups: readonly string[] | undefined,
    map: AccessMap,
    now: number,
): boolean {
    if (!content || !hasDownloadableMedia(content)) return false;
    if (!isAccessMapLoaded(map) || !parentGroups) return false;
    const parentType = content.parentType === DocType.Tag ? "tag" : "post";
    if (!mayDownload(map, parentGroups, parentType)) return false;
    return content.expiryDate === undefined || content.expiryDate > now;
}
