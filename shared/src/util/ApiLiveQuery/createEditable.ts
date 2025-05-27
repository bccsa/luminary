import { computed, Ref, ref, toRaw, watch } from "vue";
import { BaseDocumentDto } from "../../types";
import _ from "lodash";

/**
 * Creates an editable version of the source array, allowing modifications while keeping a shadow copy.
 * @param source
 * @returns
 */
export function createEditable<T extends BaseDocumentDto>(source: Ref<Array<T>> | undefined) {
    if (!source || !Array.isArray(source.value)) {
        throw new Error("Source must be a ref of an array of BaseDocumentDto");
    }

    const editable = ref<Array<T>>(_.cloneDeep(toRaw(source.value))) as Ref<Array<T>>;
    const shadow = ref<Array<T>>(_.cloneDeep(toRaw(source.value))) as Ref<Array<T>>;

    // Get a list of user modified items
    const edited = computed(() => {
        return editable.value.filter((item) => {
            const shadowItem = shadow.value.find((s) => s._id === item._id);
            return (
                !shadowItem ||
                !_.isEqual(
                    { ...shadowItem, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
                    { ...item, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
                )
            );
        });
    });

    // Get a list of source modified items
    const modified = computed(() => {
        return shadow.value.filter((item) => {
            const sourceItem = source.value.find((s) => s._id === item._id);
            return (
                !sourceItem ||
                !_.isEqual(
                    { ...sourceItem, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
                    { ...item, _rev: "", updatedTimeUtc: 0, updatedBy: "" },
                )
            );
        });
    });

    // Watch for additions / deletions in the source and update the shadow copy and editable copy accordingly
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
                shadow.value.push(...added);
                editable.value.push(...added);
            }
            if (removed.length > 0) {
                shadow.value = shadow.value.filter(
                    (item) => !removed.some((r) => r._id === item._id),
                );
                editable.value = editable.value.filter(
                    (item) => !removed.some((r) => r._id === item._id),
                );
            }
        },
        { deep: true, immediate: true },
    );

    return { editable, edited, modified };
}
