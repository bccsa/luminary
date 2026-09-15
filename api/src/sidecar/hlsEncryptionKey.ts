import { DbService } from "../db/db.service";
import { PostDto } from "../dto/PostDto";
import { TagDto } from "../dto/TagDto";
import { SidecarType, Uuid } from "../enums";
import { getSidecar, upsertSidecar } from "./sidecar.service";

/** Masked AES-128 HLS key. Stored XOR-masked with SHA-256(sidecar _id)[0..15]
 *  so the stored form is not the raw key; the client re-derives the mask. */
export type HlsEncryptionKeyData = {
    /** AES-128 key, hex, masked. */
    maskedKeyHex: string;
};

/** Type guard for a DB-read payload: 32 lowercase hex chars = 16-byte AES-128 key. */
export function isHlsEncryptionKeyData(data: unknown): data is HlsEncryptionKeyData {
    const d = data as HlsEncryptionKeyData;
    return (
        typeof d?.maskedKeyHex === "string" && /^[0-9a-f]{32}$/.test(d.maskedKeyHex)
    );
}

/** Write (or replace) the masked HLS key sidecar for a Post/Tag. */
export async function upsertHlsKeySidecar(
    db: DbService,
    parent: PostDto | TagDto,
    data: HlsEncryptionKeyData,
): Promise<Uuid> {
    return upsertSidecar(db, parent, SidecarType.HlsEncryptionKey, data);
}

/** Read the HLS key for a parent. undefined = absent; throws on a corrupt payload (→ 409 at the endpoint). */
export async function getHlsKeySidecar(
    db: DbService,
    parentId: Uuid,
): Promise<HlsEncryptionKeyData | undefined> {
    const sidecar = await getSidecar(db, parentId, SidecarType.HlsEncryptionKey);
    if (!sidecar) return undefined;
    if (!isHlsEncryptionKeyData(sidecar.data))
        throw new Error(
            `Corrupt hlsEncryptionKey sidecar for ${parentId}: data failed isHlsEncryptionKeyData`,
        );
    return sidecar.data;
}