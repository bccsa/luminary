import { computed, nextTick, Ref, ref, toRaw, watch } from "vue";
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
    /**
     * Fields that should always track the source, even on a document the user has edited. For each
     * listed field, when the source value diverges from the baseline (shadow) it is copied
     * source → editable AND source → shadow, so the back-patched value never reads as dirty. Use
     * for server-owned / out-of-band fields (e.g. upload results the server fills in
     * asynchronously). Server-wins: a concurrent local edit to a listed field is overwritten when
     * the source changes it; a listed field the source has not changed is left untouched, so an
     * unsaved local edit to it is preserved.
     */
    backPatchFields?: (keyof T)[];
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
        cloneDeep(toRaw(source.value)).map((item) => _applyModifier(item)),
    ) as Ref<Array<T>>;
    const shadow = ref<Array<T>>(cloneDeep(toRaw(source.value))) as Ref<Array<T>>;

    const backPatchFields = options.backPatchFields ?? [];

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
                shadow.value.push(...cloneDeep(added));
                if (!editable.value.find((e) => e._id === added[0]._id))
                    editable.value.push(...cloneDeep(added).map((item) => _applyModifier(item)));
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
                        shadow.value[shadowIndex] = cloneDeep(updatedItem as T);
                    }
                }

                // Update editable array - only iterate through items that actually changed
                for (const updatedItem of sourceUpdated) {
                    const editableIndex = editable.value.findIndex(
                        (e) => e._id === updatedItem._id,
                    );
                    if (editableIndex !== -1) {
                        editable.value[editableIndex] = _applyModifier(
                            cloneDeep(updatedItem as T),
                        );
                    }
                }
            }

            // Back-patch server-owned fields onto edited docs. Unedited docs were already patched
            // wholesale above (source == shadow for every field now, so this is a no-op for them);
            // this keeps listed fields flowing into docs frozen by the edit guard above. The gate
            // diffs the source field against the baseline (shadow), not against the editable, so an
            // unsaved local edit to a field the source has not changed is preserved.
            if (backPatchFields.length > 0) {
                for (const sourceItem of source.value) {
                    const shadowItem = shadow.value.find((s) => s._id === sourceItem._id);
                    const editableItem = editable.value.find((e) => e._id === sourceItem._id);
                    if (!shadowItem || !editableItem) continue;
                    for (const field of backPatchFields) {
                        if (backPatchFieldEqual(sourceItem[field], shadowItem[field])) continue; // unchanged in source
                        editableItem[field] = cloneDeep(sourceItem[field]);
                        shadowItem[field] = cloneDeep(sourceItem[field]);
                    }
                }
            }
        },
        { deep: true, immediate: true },
    );

    // monitor the editable array for new items and run the modify function if provided
    let oldValue: Array<T> | undefined;
    if (!oldValue) {
        oldValue = [...cloneDeep(editable.value)];
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

            oldValue = [...cloneDeep(newValue)]; // Update oldValue to the current state of editable
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
            editable.value[editableIndex] = _applyModifier(cloneDeep(toRaw(shadowItem)));
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
            shadow.value.push(cloneDeep(toRaw(editableItem)));
        } else {
            shadow.value[index] = cloneDeep(toRaw(editableItem));
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

    /**
     * Create a copy of an existing item as a new, unsaved document. The clone gets a fresh `_id`
     * (`db.uuid()`), its `_rev` and `deleteReq` cleared, and is pushed into the editable array only
     * (NOT the shadow) — so it reads as a new, edited, unsaved doc, exactly like any other
     * locally-added item (`isEdited(clone._id)` is true). The clone is NOT saved: the caller decides
     * when (and whether) to persist it via `save(clone._id)`, since some callers stage the copy for
     * the user to edit first and others save immediately.
     * @param id - The _id of the item to duplicate (looked up in editable, then source).
     * @param modify - Optional callback to mutate the clone (e.g. rename, clear upload state, reset
     * status) before it is pushed. Runs before the configured `modifyFn`.
     * @returns the clone (with its new `_id`), or undefined if the source item was not found.
     */
    const duplicate = (id: Uuid, modify?: (clone: T) => T): T | undefined => {
        const item =
            editable.value.find((i) => i._id === id) ?? source?.value.find((i) => i._id === id);
        if (!item) return undefined;

        let clone = cloneDeep(toRaw(item)) as T;
        clone._id = db.uuid();
        clone._rev = undefined;
        delete clone.deleteReq;

        // Caller transform (rename / clear uploads / reset status) runs first; the configured
        // modifyFn runs last so it has the final say AND so the editable-watcher's re-apply of
        // modifyFn on the pushed item is a no-op rather than a second, divergent transform.
        if (modify) clone = modify(clone);
        clone = _applyModifier(clone);

        editable.value.push(clone);
        return clone;
    };

    /**
     * Remove (delete) an item.
     * - For a new, never-saved item (not present in the shadow) there is nothing to queue: it is
     *   spliced out of editable and an Accepted ack is returned (mirrors {@link revert}).
     * - Otherwise the item is marked `deleteReq = 1` and saved through the normal {@link save}
     *   routing (local `db.upsert` delete, or API `/changerequest`). On an Accepted ack the item is
     *   spliced from both editable and shadow for immediate UI feedback; on a non-Accepted ack
     *   `deleteReq` is cleared so the item is not left half-deleted, and the ack is returned.
     *
     * Named `remove` (not `delete`) because `delete` is a reserved word and cannot be used as a
     * destructuring binding (`const { delete } = toEditable(...)`); callers may alias it if desired.
     * @param id - The _id of the item to remove.
     * @returns the save ack, or undefined when the underlying API call returned undefined.
     */
    const remove = async (id: Uuid): Promise<ChangeReqAckDto | undefined> => {
        const editableIndex = editable.value.findIndex((i) => i._id === id);
        if (editableIndex === -1) return { ack: AckStatus.Rejected, message: "Item not found" };

        const inShadow = shadow.value.some((s) => s._id === id);
        if (!inShadow) {
            // New, unsaved item — nothing queued anywhere, just drop it.
            editable.value.splice(editableIndex, 1);
            return { ack: AckStatus.Accepted };
        }

        // Mark for deletion and let the filtered refs flush so save()'s isEdited guard sees the
        // change (deleteReq is a real field diff; without the flush save() would no-op).
        editable.value[editableIndex].deleteReq = 1;
        await nextTick();

        const res = await save(id);

        if (res && res.ack === AckStatus.Accepted) {
            // Drop from both arrays for immediate UI feedback. On the local path the live source
            // also reconciles the doc out; the source-watcher's removed-detection is keyed on _id
            // and idempotent, so this pre-emptive removal cannot resurrect or double-remove.
            const eIdx = editable.value.findIndex((i) => i._id === id);
            if (eIdx !== -1) editable.value.splice(eIdx, 1);
            const sIdx = shadow.value.findIndex((i) => i._id === id);
            if (sIdx !== -1) shadow.value.splice(sIdx, 1);
        } else {
            // Save failed/rejected — undo the deletion mark so the item isn't left half-deleted.
            const eIdx = editable.value.findIndex((i) => i._id === id);
            if (eIdx !== -1) editable.value[eIdx].deleteReq = undefined;
        }

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

    return { editable, isEdited, isModified, revert, updateShadow, save, duplicate, remove };
}

/**
 * `_.isEqualWith` customizer for `ArrayBuffer`s. Documents can carry binary upload payloads
 * (`imageData`/`media` `uploadData[].fileData: ArrayBuffer`); lodash compares those via
 * `equalByTag`, whose `byteLength` access throws ("incompatible receiver") when the buffer is
 * reached through a Vue reactive proxy. We compare by byte length instead — a genuine change to a
 * binary field also changes the surrounding structure (uploadData presence / fileCollections),
 * which lodash detects before recursing into the buffer, so byte length is a sufficient (and safe)
 * comparison here.
 */
function cloneArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
    try {
        const ab = toRaw(buffer) as ArrayBuffer;
        const copy = new ArrayBuffer(ab.byteLength);
        new Uint8Array(copy).set(new Uint8Array(ab));
        return copy;
    } catch {
        return structuredClone(toRaw(buffer) as ArrayBuffer);
    }
}

function cloneDeepCustomizer(value: unknown): unknown | undefined {
    if (Object.prototype.toString.call(value) === "[object ArrayBuffer]") {
        return cloneArrayBuffer(value as ArrayBuffer);
    }
    return undefined;
}

function cloneDeep<T>(value: T): T {
    return _.cloneDeepWith(value, cloneDeepCustomizer) as T;
}

function arrayBufferCustomizer(x: unknown, y: unknown): boolean | undefined {
    if (
        Object.prototype.toString.call(x) === "[object ArrayBuffer]" &&
        Object.prototype.toString.call(y) === "[object ArrayBuffer]"
    ) {
        try {
            return (toRaw(x) as ArrayBuffer).byteLength === (toRaw(y) as ArrayBuffer).byteLength;
        } catch {
            // `byteLength` throws ("incompatible receiver") when the buffer is reached through a
            // reactive proxy the running Vue instance can't unwrap. We can't read it, so treat the
            // field as unchanged: skipping the back-patch never clobbers a local edit, and a
            // genuine server change to a binary field also changes the surrounding structure
            // (uploadData presence / fileCollections), which is detected before recursing here.
            return true;
        }
    }
    return undefined;
}

function isEqualBase<T>(obj1: T, obj2: T): boolean {
    return _.isEqualWith(
        { ...obj1, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
        { ...obj2, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
        arrayBufferCustomizer,
    );
}

function backPatchFieldEqual(a: unknown, b: unknown): boolean {
    return _.isEqualWith(a, b, arrayBufferCustomizer);
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
