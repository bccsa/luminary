import { getRest } from "../api/RestApi";
import { SidecarType } from "../types/enum";
import type { HlsEncryptionKeyData } from "../types/dto";
import { unmaskKeyHex } from "./unmaskKeyHex";

/**
 * The plaintext AES-128 key (hex) for a parent's encrypted HLS collection, or
 * `undefined` when there is none to use — no sidecar, no permission, or a
 * malformed payload all read the same to a player.
 */
export async function fetchHlsKey(
    parentId: string,
    opts: { cms?: boolean } = {},
): Promise<string | undefined> {
    const sidecar = await getRest().getSidecar(parentId, SidecarType.HlsEncryptionKey, opts);
    const data = sidecar?.data as HlsEncryptionKeyData | undefined;
    if (!sidecar || !data?.maskedKeyHex) return undefined;
    return await unmaskKeyHex(sidecar.sidecarId, data.maskedKeyHex);
}
