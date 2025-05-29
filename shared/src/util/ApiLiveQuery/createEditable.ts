import { computed, Ref, ref, toRaw, watch } from "vue";
import { BaseDocumentDto, Uuid } from "../../types";
import _ from "lodash";

/**
 * Creates an editable version of the source array, allowing modifications while keeping track of user and source modifications.
 * The editable array is kept up to date with changes to the source array, unless the user has made modifications.
 * @param source
 * @returns
 */
export function createEditable<T extends BaseDocumentDto>(source: Ref<Array<T>> | undefined) {
    if (!source || !Array.isArray(source.value)) {
        throw new Error("Source must be a ref of an array of BaseDocumentDto");
    }

    const editable = ref<Array<T>>(_.cloneDeep(toRaw(source.value))) as Ref<Array<T>>;
    const shadow = ref<Array<T>>(_.cloneDeep(toRaw(source.value))) as Ref<Array<T>>;

    /**
     * Check if an item has been edited by the user.
     * @param id - The _id of the item to check.
     * @returns a computed function giving true if the item has been edited, false otherwise.
     */
    const isEdited = computed(() => (id: Uuid) => {
        const shadowItem = shadow.value.find((s) => s._id === id);
        const editableItem = editable.value.find((e) => e._id === id);
        if (!editableItem) return false; // If the item is not in the editable array, it cannot be edited
        if (!shadowItem) return true; // If the item is not in the shadow array but it is in the edited array, it is considered edited
        return !_.isEqual(
            { ...shadowItem, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
            { ...editableItem, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
        );
    });

    /**
     * Check if an item has been modified in the source array. This will only return true for items that have been edited by the user AND modified in the source array.
     * @param id - The _id of the item to check.
     * @returns a computed function giving true if the item has been modified, false otherwise.
     */
    const isModified = computed(() => (id: Uuid) => {
        const shadowItem = shadow.value.find((s) => s._id === id);
        const sourceItem = source.value.find((e) => e._id === id);
        if (!sourceItem) return false; // If the item is not in the source array, it cannot be modified
        if (!shadowItem) return true; // This condition should not happen as the shadow array is updated with the source array when source items are added or removed
        return !_.isEqual(
            { ...shadowItem, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
            { ...sourceItem, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
        );
    });

    /**
     * Reverts an item to its original state from the source data.
     * @param id - The _id of the item to revert.
     */
    const revert = (id: Uuid) => {
        const index = editable.value.findIndex((i) => i._id === id);
        if (index === -1) return; // If the item is not found in the editable array, do nothing
        // Revert the item to its original state from the source data
        const originalItem = source.value.find((i) => i._id === id);
        if (originalItem) {
            editable.value[index] = _.cloneDeep(originalItem);
            shadow.value[index] = _.cloneDeep(originalItem);
        } else {
            console.warn(`Item with id ${id} not found in source data. Cannot revert.`);
        }
    };

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
                editable.value.push(..._.cloneDeep(added));
            }

            if (removed.length > 0) {
                shadow.value = shadow.value.filter(
                    (item) => !removed.some((r) => r._id === item._id),
                );
                editable.value = editable.value.filter(
                    (item) => !removed.some((r) => r._id === item._id),
                );
            }

            const sourceUpdated = source.value.filter((sourceItem) => {
                const shadowItem = shadow.value.find((s) => s._id === sourceItem._id);
                const editableItem = editable.value.find((e) => e._id === sourceItem._id);
                if (!shadowItem) return false; // this condition should not happen as the shadow array is updated with the source array when source items are added or removed

                // If the item is modified by the user, it should be excluded the updated list
                if (
                    !_.isEqual(
                        { ...shadowItem, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
                        { ...editableItem, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
                    )
                )
                    return false;

                return !_.isEqual(
                    { ...shadowItem, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
                    { ...sourceItem, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
                );
            });

            if (sourceUpdated.length > 0) {
                shadow.value = shadow.value.map((s) => {
                    const updatedItem = sourceUpdated.find((m) => m._id === s._id);
                    return updatedItem ? _.cloneDeep(updatedItem as T) : s;
                });
                editable.value = editable.value.map((e) => {
                    const updatedItem = sourceUpdated.find((m) => m._id === e._id);
                    return updatedItem ? _.cloneDeep(updatedItem as T) : e;
                });
            }
        },
        { deep: true, immediate: true },
    );

    return { editable, isEdited, isModified, revert };
}
