import { AuthProviderConfigDto } from "../../dto/AuthProviderConfigDto";

/**
 * Process AuthProviderConfig DTO
 * - Enforces singleton ID to prevent duplicate docs
 * - Normalizes legacy `{ groupId: string }` mappings to `{ groupIds: string[] }`
 *   so the DTO validator can require `groupIds` unconditionally and any write
 *   from an old client (pre-refactor CMS, pre-refactor add-auth-provider.ts,
 *   direct API callers) gets migrated transparently on its first save.
 */
export default async function processAuthProviderConfigDto(doc: AuthProviderConfigDto) {
    doc._id = "authProviderConfig";

    if (!doc.providers || typeof doc.providers !== "object") return;

    for (const providerConfig of Object.values(doc.providers)) {
        if (!providerConfig || !Array.isArray(providerConfig.groupMappings)) continue;
        for (const mapping of providerConfig.groupMappings) {
            if (!mapping || typeof mapping !== "object") continue;
            const legacy = mapping as unknown as { groupId?: string; groupIds?: string[] };
            if (Array.isArray(legacy.groupIds)) {
                // New-shape doc — drop any stale legacy key that might have slipped through.
                if ("groupId" in legacy) delete legacy.groupId;
                continue;
            }
            legacy.groupIds = legacy.groupId ? [legacy.groupId] : [];
            delete legacy.groupId;
        }
    }
}
