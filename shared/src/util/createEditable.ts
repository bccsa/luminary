import { computed, Ref, ref, toRaw, watch } from "vue";
import { BaseDocumentDto, Uuid } from "../types";
import _ from "lodash";

export type CreateEditableOptions<T> = {
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
};

/**
 * Creates an editable version of the source array, allowing modifications while keeping track of user and source modifications.
 * The editable array is kept up to date with changes to the source array, unless the user has made modifications.
 * @param source
 * @param options Optional options to customize the behavior of the editable array.
 * @returns
 */
export function createEditable<T extends BaseDocumentDto>(
    source: Ref<Array<T>> | undefined,
    options: CreateEditableOptions<T> = {},
) {
    if (!source || !Array.isArray(source.value)) {
        throw new Error("Source must be a ref of an array of BaseDocumentDto");
    }

    const editable = ref<Array<T>>(_.cloneDeep(toRaw(source.value))) as Ref<Array<T>>;
    const shadow = ref<Array<T>>(_.cloneDeep(toRaw(source.value))) as Ref<Array<T>>;

    const source_filtered = ref<Array<T>>([]);
    watch(
        source,
        () => {
            if (!options.filterFn) {
                source_filtered.value = source.value;
                return;
            }
            source_filtered.value = source.value
                .map((item) => (options.filterFn ? options.filterFn(toRaw(item)) : item))
                .filter((item) => item !== undefined);
        },
        { deep: true, immediate: true },
    );

    const editable_filtered = ref<Array<T>>([]);
    watch(
        editable,
        () => {
            if (!options.filterFn) {
                editable_filtered.value = editable.value;
                return;
            }
            editable_filtered.value = editable.value
                .map((item) => (options.filterFn ? options.filterFn(toRaw(item)) : item))
                .filter((item) => item !== undefined);
        },
        { deep: true, immediate: true },
    );

    const shadow_filtered = ref<Array<T>>([]);
    watch(
        shadow,
        () => {
            if (!options.filterFn) {
                shadow_filtered.value = shadow.value;
                return;
            }
            shadow_filtered.value = shadow.value
                .map((item) => (options.filterFn ? options.filterFn(toRaw(item)) : item))
                .filter((item) => item !== undefined);
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
        const shadowItem = shadow_filtered.value.find((s) => s._id === id);
        const sourceItem = source_filtered.value.find((e) => e._id === id);
        if (!sourceItem) return false; // If the item is not in the source array, it cannot be modified
        if (!shadowItem) return true; // This condition should not happen as the shadow array is updated with the source array when source items are added or removed
        return !isEqualBase(sourceItem, shadowItem);
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
            // If a modify function is provided, apply it to the original item
            options.modifyFn
                ? (editable.value[index] = options.modifyFn(_.cloneDeep(toRaw(originalItem))))
                : (editable.value[index] = _.cloneDeep(toRaw(originalItem)));
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
                if (!isEqualBase(shadowItem, editableItem)) return false;

                return !isEqualBase(shadowItem, sourceItem);
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

    // monitor the editable array for new items and run the modify function if provided
    let oldValue: Array<T> | undefined;
    watch(
        editable,
        (newValue) => {
            // Get the items that were added
            const addedItems = newValue.filter(
                (item) => !oldValue?.some((oldItem) => oldItem._id === item._id),
            );

            if (!addedItems.length) return;
            if (!options.modifyFn) return;

            // Modify the added items if a modify function is provided
            for (const addedItem of addedItems) {
                const index = newValue.findIndex((item) => item._id === addedItem._id);
                if (index !== -1) {
                    newValue[index] = options.modifyFn(toRaw(addedItem));
                }
            }

            oldValue = [...newValue]; // Update oldValue to the current state of editable
        },
        { deep: true, immediate: true },
    );

    return { editable, isEdited, isModified, revert };
}

function isEqualBase<T>(obj1: T, obj2: T): boolean {
    return _.isEqual(
        { ...obj1, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
        { ...obj2, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
    );
}
