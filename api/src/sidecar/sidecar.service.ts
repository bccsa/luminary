import { isDeepStrictEqual } from "util";
import { DbService } from "../db/db.service";
import { SidecarDto } from "../dto/SidecarDto";
import { PostDto } from "../dto/PostDto";
import { TagDto } from "../dto/TagDto";
import { ContentDto } from "../dto/ContentDto";
import { DocType, PublishStatus, SidecarType, Uuid } from "../enums";

// Generic mechanism — never import a payload type here; typed wrappers live in
// sidecar/<type>.ts so a registry swap stays contained.

/**
 * Deterministic sidecar ID: `sidecar-<parentId>-<sidecarType>`. Centralized so
 * a future index move is contained.
 */
export function sidecarId(parentId: Uuid, sidecarType: SidecarType): Uuid {
    return `sidecar-${parentId}-${sidecarType}`;
}

/**
 * Create or replace the sidecar for (parent, type). Idempotent (deterministic
 * _id); copies the parent's memberOf + updatedBy.
 */
export async function upsertSidecar(
    db: DbService,
    parent: PostDto | TagDto,
    sidecarType: SidecarType,
    data: unknown,
): Promise<Uuid> {
    // memberOf is always non-empty — enforced by _contentBaseDto's @ArrayNotEmpty
    // at parent creation, so no re-check here.
    const id = sidecarId(parent._id, sidecarType);
    const sidecar = new SidecarDto();
    sidecar._id = id;
    sidecar.type = DocType.Sidecar;
    sidecar.parentId = parent._id;
    sidecar.parentType = parent.type as DocType.Post | DocType.Tag;
    sidecar.sidecarType = sidecarType;
    sidecar.memberOf = parent.memberOf;
    sidecar.data = data;
    sidecar.updatedBy = parent.updatedBy; // identity that submitted the key

    await db.upsertDoc(sidecar);
    return id;
}

/** Read one sidecar. undefined = absent (not an error). */
export async function getSidecar(
    db: DbService,
    parentId: Uuid,
    sidecarType: SidecarType,
): Promise<SidecarDto | undefined> {
    const res = await db.getDoc(sidecarId(parentId, sidecarType));
    if (!res.docs?.length) return undefined;
    return res.docs[0] as SidecarDto;
}

/** Hard-delete via db.deleteDoc (not deleteReq — clients never held a sidecar, so no eviction broadcast). */
export async function deleteSidecar(
    db: DbService,
    parentId: Uuid,
    sidecarType: SidecarType,
): Promise<void> {
    await db.deleteDoc(sidecarId(parentId, sidecarType));
}

/** Hard-delete every sidecar of a parent (cascade). Primary-key deletes by SidecarType — no index needed. */
export async function deleteSidecarsForParent(db: DbService, parentId: Uuid): Promise<void> {
    for (const type of Object.values(SidecarType)) {
        await db.deleteDoc(sidecarId(parentId, type));
    }
}

/**
 * True when a non-CMS caller could currently receive at least one of this parent's Content
 * documents. Mirrors the /fts non-CMS filter (the stricter of the two — it refuses scheduled
 * content, which /query does not). Keys for unreleased or expired content must not be
 * retrievable: the encrypted segments already sit at a public URL, so the key is the only
 * thing withholding them.
 */
export async function isParentAvailable(db: DbService, parentId: Uuid, now: number): Promise<boolean> {
    const { docs } = await db.getContentByParentId(parentId);
    return (docs as ContentDto[]).some(
        (c) =>
            c.status === PublishStatus.Published &&
            c.publishDate != null &&
            c.publishDate <= now &&
            (c.expiryDate == null || c.expiryDate > now),
    );
}

/** Re-stamp the parent's memberOf onto sidecars whose memberOf differs; skip unchanged to avoid churn. */
export async function syncSidecarMemberOf(db: DbService, parent: PostDto | TagDto): Promise<void> {
    for (const type of Object.values(SidecarType)) {
        const res = await db.getDoc(sidecarId(parent._id, type));
        if (!res.docs?.length) continue;
        const sidecar = res.docs[0] as SidecarDto;
        if (
            !isDeepStrictEqual(
                [...sidecar.memberOf].sort(),
                [...parent.memberOf].sort(),
            )
        ) {
            sidecar.memberOf = parent.memberOf;
            await db.upsertDoc(sidecar);
        }
    }
}