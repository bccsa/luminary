import * as fs from "fs";
import * as path from "path";
import { DbService } from "../db.service";
import { DocType, Uuid } from "../../enums";

type GroupAclEntryLike = {
    type: DocType | string;
    groupId: Uuid;
    permission: string[];
};

type GroupDocLike = {
    _id: Uuid;
    type: DocType | string;
    acl?: GroupAclEntryLike[];
};

export type EnsureGroupAclDocTypeResult = {
    /** Groups found in seeding docs that contained at least one ACL entry for the requested docType */
    candidates: number;
    /** Groups updated in DB (docType was missing, entries were added) */
    updated: number;
    /** Groups skipped because DB doc already had at least one ACL entry for docType */
    skippedAlreadyHadDocType: number;
    /** Groups skipped because DB group doc was missing */
    skippedMissingGroupDoc: number;
    /** Groups skipped because seeding doc had no matching entries for docType */
    skippedNoMatchingEntriesInSeed: number;
};

export type EnsureGroupAclDocTypeOptions = {
    /**
     * Optional override for where to read seeding group JSON documents from.
     * Defaults to `../seedingDocs` relative to this file at runtime (works in dist build).
     */
    seedingDocsDir?: string;

    /**
     * Only apply to these group doc IDs (if omitted, uses all seeding group docs).
     */
    groupDocIds?: Uuid[];

    /**
     * If true, calculates changes but does not write to DB.
     */
    dryRun?: boolean;
};

/**
 * Schema-upgrade helper: Backfill Group ACL entries for a given DocType using the canonical
 * definitions from `db/seedingDocs/*.json`.
 *
 * It will ONLY update a group document if the group currently has NO ACL entry for the given docType.
 * This keeps it safe for production environments where admins may have customized ACLs after initial seeding.
 *
 * Typical usage (inside an upgrade script):
 *
 *   await backfillGroupAclDocType(db, DocType.Storage);
 */
export async function backfillGroupAclDocType(
    db: DbService,
    docType: DocType,
    options: EnsureGroupAclDocTypeOptions = {},
): Promise<EnsureGroupAclDocTypeResult> {
    const seedingDir = options.seedingDocsDir || path.join(__dirname, "..", "seedingDocs");

    const files = fs.readdirSync(seedingDir).filter((f) => f.endsWith(".json"));

    const seedGroups: GroupDocLike[] = files
        .map((file) => {
            const raw = fs.readFileSync(path.join(seedingDir, file)).toString();
            return JSON.parse(raw) as GroupDocLike;
        })
        .filter((doc) => doc && doc.type === DocType.Group);

    const filteredSeedGroups = options.groupDocIds?.length
        ? seedGroups.filter((g) => options.groupDocIds!.includes(g._id))
        : seedGroups;

    const res: EnsureGroupAclDocTypeResult = {
        candidates: 0,
        updated: 0,
        skippedAlreadyHadDocType: 0,
        skippedMissingGroupDoc: 0,
        skippedNoMatchingEntriesInSeed: 0,
    };

    for (const seedGroup of filteredSeedGroups) {
        const seedAcl = Array.isArray(seedGroup.acl) ? seedGroup.acl : [];
        const entriesToAdd = seedAcl.filter((e) => e?.type === docType);

        if (entriesToAdd.length === 0) {
            res.skippedNoMatchingEntriesInSeed++;
            continue;
        }

        res.candidates++;

        const dbGroupRes = await db.getDoc(seedGroup._id);
        const dbGroup = (dbGroupRes?.docs?.[0] || undefined) as GroupDocLike | undefined;
        if (!dbGroup) {
            res.skippedMissingGroupDoc++;
            continue;
        }

        const dbAcl = Array.isArray(dbGroup.acl) ? dbGroup.acl : [];
        const alreadyHasDocType = dbAcl.some((e) => e?.type === docType);
        if (alreadyHasDocType) {
            res.skippedAlreadyHadDocType++;
            continue;
        }

        // Add all seed entries for this docType (as-is)
        dbGroup.acl = [...dbAcl, ...entriesToAdd.map((e) => ({ ...e }))];

        // Only write to DB if not in dry run mode for previewing impact first
        // This is important to avoid accidentally overwriting existing ACLs with the seeding docs
        if (!options.dryRun) {
            await db.upsertDoc(dbGroup);
        }
        res.updated++;
    }

    return res;
}
