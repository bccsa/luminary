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

/**
 * Why a key fetch ended the way it did. Only `denied` is an affirmative answer that the
 * caller may not have the key; anything ambiguous is `unreachable`.
 */
export type HlsKeyOutcome =
    | { outcome: "key"; keyHex: string }
    | { outcome: "denied" }
    | { outcome: "rateLimited" }
    | { outcome: "unreachable" };

const MASKED_KEY_HEX = /^[0-9a-f]{32}$/i;

/**
 * True only for a 403 or 404 the key endpoint itself answered. The API sends every error as
 * `{ statusCode, message }`, and the endpoint's own refusal is a 404 with `"Not found"`; a
 * proxy or block page in front of it, or a 404 for an unknown route, does not match. The
 * endpoint never answers 403, but an API-shaped 403 is accepted so that a later change of its
 * refusal status needs no client release.
 */
function isAffirmativeDenial(status: number, body: unknown): boolean {
    const error = body as { statusCode?: unknown; message?: unknown } | null | undefined;
    if (error?.statusCode !== status) return false;
    return status === 403 || (status === 404 && error.message === "Not found");
}

/**
 * `fetchHlsKey` for a caller that acts on the reason for a failure, such as one holding a
 * key it should discard only when access is really gone. The endpoint answers 404 for
 * "no permission", "no such parent" and "no sidecar" alike, so all three are `denied`.
 *
 * `denied` is relative to the identity the request carried: the API treats a request without
 * credentials as anonymous rather than rejecting it. Act on it only for a request sent with
 * the current session's credentials applied.
 */
export async function fetchHlsKeyOutcome(
    parentId: string,
    opts: { cms?: boolean } = {},
): Promise<HlsKeyOutcome> {
    const res = await getRest().getSidecarWithStatus(parentId, SidecarType.HlsEncryptionKey, opts);

    if (isAffirmativeDenial(res.status, res.body)) return { outcome: "denied" };
    if (res.status === 429) return { outcome: "rateLimited" };
    if (res.status !== 200) return { outcome: "unreachable" };

    const sidecarId = res.body?.sidecarId;
    const maskedKeyHex = (res.body?.data as HlsEncryptionKeyData | undefined)?.maskedKeyHex;
    if (typeof sidecarId !== "string" || !sidecarId) return { outcome: "unreachable" };
    if (typeof maskedKeyHex !== "string" || !MASKED_KEY_HEX.test(maskedKeyHex)) {
        return { outcome: "unreachable" };
    }

    try {
        return { outcome: "key", keyHex: await unmaskKeyHex(sidecarId, maskedKeyHex) };
    } catch {
        return { outcome: "unreachable" };
    }
}
