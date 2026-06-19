import { computed, Ref, ref, toRaw, watch } from "vue";
import {
    AckStatus,
    BaseDocumentDto,
    ChangeReqAckDto,
    ContentDto,
    DocType,
    Uuid,
} from "../../types";
import { db, UpsertOptions } from "../../db/database";
import { getRest, ChangeRequestQuery } from "../../api/RestApi";
import { LFormData } from "../LFormData";
import { isSyncableDoc } from "../../db/isSyncable";
import { touchRetention } from "../../db/retention";
import { getContentPublishDateCutoff } from "../../config";
import _ from "lodash";

export type ToEditableOptions<T> = {
    /**
     * @param filterFn Optional filter function to apply to the editable array before comparing or saving.
     * This is useful if e.g. empty items should be ignored. The filter function is applied on each item of the editable array before comparing it to the source array.
     */
    filterFn?: (item: T) => T;
    /**
     *
     * @param item Optional function to modify the item before it is added to the editable array. This can be used to add default values or modify the item in some way. The function should return the modified item.
     * This is useful if you want to add default values to the item before it is added
     * @returns
     */
    modifyFn?: (item: T) => T;
    /**
     * Whether the source query persists its documents offline (IndexedDB). Pass the same value
     * the wrapped query (e.g. `useHybridQuery`/`HybridQuery`) was created with. It steers `save`:
     * when the doc is persisted offline, edits are written locally (`db.upsert` → `docs` table +
     * `localChanges` queue); otherwise they are POSTed straight to the API. See {@link toEditable}'s
     * `save` for the full routing rule.
     */
    persistOffline?: boolean;
};

/**
 * Decide whether a document is persisted offline (IndexedDB) and should therefore be saved via the
 * local path rather than POSTed directly to the API. A doc is persisted offline when the query opted
 * into offline caching (`persistOffline`), or when it is synced: for Content that means it is a
 * syncable content type AND its `publishDate` is within the sync window (`>= cutoff`); other syncable
 * types are always in-window. `isSyncableDoc` matches Content by type/parentType/language but
 * intentionally ignores `publishDate`, so the window check is layered on top here.
 */
function isPersistedOffline(doc: BaseDocumentDto, persistOffline: boolean): boolean {
    if (persistOffline) return true;
    if (!isSyncableDoc(doc)) return false;
    if (doc.type === DocType.Content) {
        const pd = (doc as ContentDto).publishDate;
        return pd !== undefined && pd >= getContentPublishDateCutoff();
    }
    return true;
}

/**
 * Converts a source array ref into an editable version, allowing modifications while keeping track of user and source modifications.
 * The editable array is kept up to date with changes to the source array, unless the user has made modifications.
 * @param source
 * @param options Optional options to customize the behavior of the editable array.
 * @returns
 */
export function toEditable<T extends BaseDocumentDto>(
    source: Ref<Array<T>> | undefined,
    options: ToEditableOptions<T> = {},
) {
    if (!source || !Array.isArray(source.value)) {
        throw new Error("Source must be a ref of an array of BaseDocumentDto");
    }

    const editable = ref<Array<T>>(
        _.cloneDeep(toRaw(source.value)).map((item) => _applyModifier(item)),
    ) as Ref<Array<T>>;
    const shadow = ref<Array<T>>(_.cloneDeep(toRaw(source.value))) as Ref<Array<T>>;

    const source_filtered = ref<Array<T>>([]) as Ref<Array<T>>;
    watch(
        source,
        () => {
            source_filtered.value = source.value
                .map((item) => _applyFilter(item))
                .filter((item) => item !== undefined);
        },
        { deep: true, immediate: true },
    );

    const editable_filtered = ref<Array<T>>([]) as Ref<Array<T>>;
    watch(
        editable,
        () => {
            editable_filtered.value = editable.value
                .map((item) => _applyFilter(item))
                .filter((item) => item !== undefined);
        },
        { deep: true, immediate: true },
    );

    const shadow_filtered = ref<Array<T>>([]) as Ref<Array<T>>;
    watch(
        shadow,
        () => {
            shadow_filtered.value = shadow.value
                .map((item) => _applyFilter(item))
                .filter((item) => item !== undefined);
        },
        { deep: true, immediate: true },
    );

    // monitor the source array for changes and update the shadow copy and editable copy accordingly
    watch(
        source,
        () => {
            const added = source.value.filter(
                (item) => !shadow.value.some((s) => s._id === item._id),
            );
            const removed = shadow.value.filter(
                (item) => !source.value.some((s) => s._id === item._id),
            );

            if (added.length > 0) {
                shadow.value.push(..._.cloneDeep(added));
                if (!editable.value.find((e) => e._id === added[0]._id))
                    editable.value.push(..._.cloneDeep(added).map((item) => _applyModifier(item)));
            }

            if (removed.length > 0) {
                shadow.value = shadow.value.filter(
                    (item) => !removed.some((r) => r._id === item._id),
                );
                editable.value = editable.value.filter(
                    (item) => !removed.some((r) => r._id === item._id),
                );
            }

            // Get the items that were updated in the source array
            const sourceUpdated = source.value.filter((sourceItem) => {
                const shadowItem = shadow_filtered.value.find((s) => s._id === sourceItem._id);
                if (!shadowItem) return false; // this condition should not happen as the shadow array is updated with the source array when source items are added or removed

                const editableItem = editable_filtered.value.find((e) => e._id === sourceItem._id);
                if (!editableItem) return false;

                // If the item is modified by the user, it should be excluded from the updated list
                if (!isEqualBase(shadowItem, editableItem)) return false;

                return !isEqualBase(shadowItem, sourceItem);
            });

            // Patch the shadow and editable arrays with the updated items
            if (sourceUpdated.length > 0) {
                // Update shadow array - only iterate through items that actually changed
                for (const updatedItem of sourceUpdated) {
                    const shadowIndex = shadow.value.findIndex((s) => s._id === updatedItem._id);
                    if (shadowIndex !== -1) {
                        shadow.value[shadowIndex] = _.cloneDeep(updatedItem as T);
                    }
                }

                // Update editable array - only iterate through items that actually changed
                for (const updatedItem of sourceUpdated) {
                    const editableIndex = editable.value.findIndex(
                        (e) => e._id === updatedItem._id,
                    );
                    if (editableIndex !== -1) {
                        editable.value[editableIndex] = _applyModifier(
                            _.cloneDeep(updatedItem as T),
                        );
                    }
                }
            }
        },
        { deep: true, immediate: true },
    );

    // monitor the editable array for new items and run the modify function if provided
    let oldValue: Array<T> | undefined;
    if (!oldValue) {
        oldValue = [..._.cloneDeep(editable.value)];
    }
    watch(
        editable,
        (newValue) => {
            // Get the items that were added or modified
            const modifiedItems = newValue.filter((item) => {
                const oldItem = oldValue?.find((i) => i._id === item._id);
                return !oldItem || !isEqualBase(oldItem, item);
            });

            // Modify the added items if a modify function is provided
            for (const item of modifiedItems) {
                const index = newValue.findIndex((i) => i._id === item._id);
                if (index !== -1) {
                    newValue[index] = _applyModifier(toRaw(item));
                }
            }

            oldValue = [..._.cloneDeep(newValue)]; // Update oldValue to the current state of editable
        },
        { deep: true, immediate: true },
    );

    /**
     * Check if an item has been edited by the user.
     * @param id - The _id of the item to check.
     * @returns a computed function giving true if the item has been edited, false otherwise.
     */
    const isEdited = computed(() => (id: Uuid) => {
        const shadowItem = toRaw(shadow_filtered.value.find((s) => s._id === id));
        const editableItem = toRaw(editable_filtered.value.find((e) => e._id === id));
        if (!editableItem) return false; // If the item is not in the editable array, it cannot be edited
        if (!shadowItem) return true; // If the item is not in the shadow array but it is in the edited array, it is considered edited
        return !isEqualBase(shadowItem, editableItem);
    });

    /**
     * Check if an item has been modified in the source array. This will only return true for items that have been edited by the user AND modified in the source array.
     * @param id - The _id of the item to check.
     * @returns a computed function giving true if the item has been modified, false otherwise.
     */
    const isModified = computed(() => (id: Uuid) => {
        const shadowItem = toRaw(shadow_filtered.value.find((s) => s._id === id));
        const sourceItem = toRaw(source_filtered.value.find((e) => e._id === id));
        if (!sourceItem) return false; // If the item is not in the source array, it cannot be modified
        if (!shadowItem) return true; // This condition should not happen as the shadow array is updated with the source array when source items are added or removed
        return !isEqualBase(sourceItem, shadowItem);
    });

    /**
     * Reverts an item to its original state from the source data.
     * @param id - The _id of the item to revert.
     */
    const revert = (id: Uuid) => {
        const editableIndex = editable.value.findIndex((i) => i._id === id);
        if (editableIndex === -1) return; // If the item is not found in the editable array, do nothing

        const shadowItem = shadow.value.find((i) => i._id === id);
        if (shadowItem) {
            // Revert the item to its original state from the shadow data
            // If a modify function is provided, apply it to the original item
            editable.value[editableIndex] = _applyModifier(_.cloneDeep(toRaw(shadowItem)));
        } else {
            // Item not found in shadow, so it's a new item. Remove it from editable.
            editable.value.splice(editableIndex, 1);
        }
    };

    /**
     * Updates the shadow copy of an item with the current editable item.
     * @param id - The _id of the item to update in the shadow copy.
     * @returns
     */
    const updateShadow = (id: Uuid) => {
        const editableItem = editable.value.find((i) => i._id === id);
        if (!editableItem) return;

        const index = shadow.value.findIndex((i) => i._id === id);
        if (index === -1) {
            // If the item is not found in the shadow array, add it. This is for new items to improve dirty checking accuracy
            shadow.value.push(_.cloneDeep(toRaw(editableItem)));
        } else {
            shadow.value[index] = _.cloneDeep(toRaw(editableItem));
        }
    };

    /**
     * Save an edited item. Routes per-document: items that are persisted offline (synced, or the
     * query opted into `persistOffline`) are written locally via `db.upsert` (the `docs` table plus
     * a queued `localChanges` entry for later upload); items that are not persisted offline are
     * POSTed straight to the API `/changerequest` endpoint. No-ops (returns "accepted") when the
     * item has not been edited. The `filterFn` (if any) is applied to the item before saving.
     * @param id - The _id of the item to save.
     */
    const save = async (id: Uuid): Promise<ChangeReqAckDto | undefined> => {
        if (!isEdited.value(id)) return { ack: AckStatus.Accepted };

        let item = toRaw(editable.value.find((i) => i._id === id));
        if (!item) return { ack: AckStatus.Rejected, message: "Item not found" };

        // Apply the filter function (if any) before saving, mirroring the legacy editable wrappers.
        item = _applyFilter(item);

        if (isPersistedOffline(item, options.persistOffline ?? false)) {
            // Local path: write to the docs table and queue a localChange for upload.
            await db.upsert({ doc: item, overwriteLocalChanges: true } as UpsertOptions<T>);

            // Below-cutoff Content lives in IndexedDB only because of offline persistence; refresh
            // its retention keep-alive so evictStaleBelowCutoff won't reap the doc we just saved.
            // Synced (above-cutoff / other syncable) docs need no stamp — eviction never targets them.
            const pd = (item as BaseDocumentDto as ContentDto).publishDate;
            if (item.type === DocType.Content && pd !== undefined && pd < getContentPublishDateCutoff()) {
                touchRetention([id]);
            }

            updateShadow(id);
            return {
                ack: AckStatus.Accepted,
                message: "Saved locally and queued for upload to the server",
            };
        }

        // API path: POST directly to /changerequest, bypassing local persistence. Use LFormData when
        // the document carries binary upload data (ArrayBuffer is not JSON-serializable); the local
        // path above stores it directly via IndexedDB's structured clone.
        const hasUploadData = (item as any).imageData?.uploadData?.length > 0;
        let res: ChangeReqAckDto | undefined;
        if (hasUploadData) {
            const formData = new LFormData();
            formData.append("changeRequest", { id: 10, doc: item });
            res = (await getRest().changeRequest(formData)) as ChangeReqAckDto | undefined;
        } else {
            res = (await getRest().changeRequest({
                id: 10,
                doc: item,
            } as ChangeRequestQuery)) as ChangeReqAckDto | undefined;
        }

        if (res && res.ack === AckStatus.Accepted) updateShadow(id);
        return res;
    };

    function _applyModifier(item: T) {
        if (!options.modifyFn) return item;
        return options.modifyFn(item);
    }

    function _applyFilter(item: T) {
        if (!options.filterFn) return item;
        return options.filterFn(item);
    }

    return { editable, isEdited, isModified, revert, updateShadow, save };
}

function isEqualBase<T>(obj1: T, obj2: T): boolean {
    return _.isEqual(
        { ...obj1, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
        { ...obj2, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
    );
}

/**
 * @deprecated Use {@link toEditable} instead. Renamed for naming consistency with the `to*`
 * conversion helpers (e.g. `toRef`, `toRefs`); this forwarding export will be removed in a
 * future release.
 */
export const createEditable = toEditable;

/**
 * @deprecated Use {@link ToEditableOptions} instead. This alias will be removed in a future release.
 */
export type CreateEditableOptions<T> = ToEditableOptions<T>;
