import {
    normalizeUserActivityDocument,
    type DataSourceHandle,
    type UserActivityDto,
    type LocalChangeDto,
} from "luminary-shared";

const FORMAT_KEY = "activityDocumentFormat";

export async function migrateActivityFormat(db: DataSourceHandle["db"]): Promise<void> {
    await db.transaction("rw", db.docs, db.localChanges, db.luminaryInternals, async () => {
        if ((await db.getLuminaryInternals(FORMAT_KEY)) === 2) return;
        const documents = new Map<string, UserActivityDto>();
        const queued = new Map<string, LocalChangeDto>();
        const keep = (doc: UserActivityDto) => {
            const previous = documents.get(doc._id);
            if (
                !previous ||
                doc.activityTimeUtc > previous.activityTimeUtc ||
                (doc.activityTimeUtc === previous.activityTimeUtc &&
                    (doc.deleted || !previous.deleted))
            ) {
                documents.set(doc._id, doc);
            }
        };
        for (const raw of await db.docs.toArray()) keep(normalizeUserActivityDocument(raw as any));
        for (const change of await db.localChanges.orderBy("id").toArray()) {
            const doc = normalizeUserActivityDocument(change.doc as any);
            const previous = queued.get(doc._id);
            if (
                !previous ||
                (previous.doc as UserActivityDto).activityTimeUtc <= doc.activityTimeUtc
            ) {
                queued.set(doc._id, { ...change, id: change.id!, docId: doc._id, doc });
            }
            keep(doc);
        }
        await db.docs.clear();
        await db.docs.bulkPut([...documents.values()]);
        await db.localChanges.clear();
        await db.localChanges.bulkPut([...queued.values()]);
        await db.setLuminaryInternals(FORMAT_KEY, 2);
    });
}
