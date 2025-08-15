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

    function _applyModifier(item: T) {
        if (!options.modifyFn) return item;
        return options.modifyFn(item);
    }

    function _applyFilter(item: T) {
        if (!options.filterFn) return item;
        return options.filterFn(item);
    }

    return { editable, isEdited, isModified, revert, updateShadow };
}

function isEqualBase<T>(obj1: T, obj2: T): boolean {
    return _.isEqual(
        { ...obj1, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
        { ...obj2, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
    );
}
