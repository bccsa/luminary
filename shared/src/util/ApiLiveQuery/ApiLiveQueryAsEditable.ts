import { ComputedRef, Ref } from "vue";
import { ApiSearchQuery, ChangeRequestQuery, getRest } from "../../rest/RestApi";
import { AckStatus, BaseDocumentDto, Uuid } from "../../types";
import { createEditable } from "../createEditable";
import { ApiLiveQuery, ApiLiveQueryOptions } from "./ApiLiveQuery";

/**
 * This class extends ApiLiveQuery to provide an editable array with state management.
 * @param query The query to subscribe to. It should be a valid ApiSearchQuery object.
 * @param options Options for the live query.
 * @returns A Vue ref that contains the data from the query. The data will be updated
 * automatically when the data changes in the database.
 */
export class ApiLiveQueryAsEditable<T extends BaseDocumentDto> extends ApiLiveQuery<T> {
    isEdited;
    isModified;
    revert;
    editable;

    constructor(query: Ref<ApiSearchQuery>, options?: ApiLiveQueryOptions<T>) {
        super(query, options);
        // Bind async methods to the class instance
        this.save = this.save.bind(this);

        // Map createEditable functions and properties to class properties
        const editableFunctions = createEditable<T>(this._sourceData);
        this.isEdited = editableFunctions.isEdited;
        this.isModified = editableFunctions.isModified;
        this.revert = editableFunctions.revert;
        this.editable = editableFunctions.editable;
    }

    /**
     * Save the current state of an editable item to the database.
     * This method will not save the item if it has not been modified.
     * @param id - The _id of the item to save.
     */
    public async save(id: Uuid) {
        if (!this.isEdited.value(id)) return { ack: AckStatus.Accepted };

        const item = this.editable.value.find((i) => i._id === id);
        if (!item) return { ack: AckStatus.Rejected, message: "Item not found" };

        // Send the change request to the API
        const res = await getRest().changeRequest({
            id: 10, // TODO: The ID field is not used in the API, but it is still required by the API. This can be removed in the future.
            doc: item,
        } as ChangeRequestQuery);

        if (res && res.ack == AckStatus.Accepted) {
            // Update the shadow copy
            const index = this.editable.value.findIndex((i) => i._id === id);
            if (index !== -1) this.editable.value[index] = item;
        }

        return res; // TODO: Add type for the response. This will involve adding a type for the API response.
    }
}
