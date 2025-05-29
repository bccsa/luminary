import { computed, ComputedRef, Ref, ref, watch } from "vue";
import { ApiSearchQuery, ChangeRequestQuery, getRest } from "../../rest/RestApi";
import { getSocket, isConnected } from "../../socket/socketio";
import { AckStatus, ApiQueryResult, BaseDocumentDto, Uuid } from "../../types";
import { applySocketData } from "./applySocketData";
import { createEditable } from "./createEditable";
import _ from "lodash";

export type ApiLiveQueryOptions<T> = {
    /** Provide an initial value while waiting for the API response */
    initialValue?: Array<T>;
    /** Enable an editable copy of the live data with state management */
    enableEditable?: boolean;
};

/**
 * ApiLiveQuery is a wrapper around the REST API and socket.io to provide a live query
 * functionality. It allows you to subscribe to a query and get live updates when the data
 * changes. It uses Vue's reactivity system to provide a reactive API.
 * @param query The query to subscribe to. It should be a valid ApiSearchQuery object.
 * @param options Options for the live query.
 * @returns A Vue ref that contains the data from the query. The data will be updated
 * automatically when the data changes in the database.
 */
export class ApiLiveQuery<T extends BaseDocumentDto> {
    private _sourceData: Ref<Array<T>>;
    private _firstItem: ComputedRef<T | undefined>;
    private _liveData: ComputedRef<Array<T>>;
    private _socketOnCallback: ((data: ApiQueryResult<T>) => void) | undefined = undefined;
    private _unwatch;
    private _isLoading = ref(true);
    private _editable: Ref<Array<T>> | undefined = undefined;
    private _isEdited: ComputedRef<(id: Uuid) => boolean> | undefined;
    private _isModified: ComputedRef<(id: Uuid) => boolean> | undefined;
    private _revert: ((id: Uuid) => void) | undefined;

    constructor(query: Ref<ApiSearchQuery>, options?: ApiLiveQueryOptions<T>) {
        // Validate the query
        if (query.value.groups) {
            throw new Error("groups are not supported in ApiLiveQuery");
        }

        if (query.value.queryString) {
            throw new Error("queryString is not implemented yet");
        }

        this._sourceData = ref((options?.initialValue as Array<T>) ?? ([] as Array<T>)) as Ref<
            Array<T>
        >;

        if (options?.enableEditable) {
            const editable = createEditable<T>(this._sourceData);
            this._editable = editable.editable;
            this._isEdited = editable.isEdited;
            this._isModified = editable.isModified;
            this._revert = editable.revert;
        }

        this._firstItem = computed(() => {
            if (!this._sourceData || !this._sourceData.value || !this._sourceData.value.length)
                return undefined;
            return this._sourceData.value[0];
        });

        this._liveData = computed(() => {
            return this._sourceData.value;
        });

        // Fetch initial data from the REST API and subscribe to live updates
        this._unwatch = watch(
            [query, isConnected],
            () => {
                this.unsubscribeLiveData();

                if (!isConnected.value) {
                    this._isLoading.value = false;
                    return;
                }

                this._isLoading.value = true;

                getRest()
                    .search(query.value)
                    .then((result) => {
                        this._sourceData.value = result.docs as Array<T>;
                    })
                    .catch((error) => {
                        console.error("Error fetching data from API:", error);
                    })
                    .finally(() => {
                        this._isLoading.value = false;
                    });

                // Listen for updates from the socket
                this._socketOnCallback = (data) =>
                    applySocketData<T>(data, this._sourceData, query.value);
                getSocket().on("data", this._socketOnCallback);
            },
            { immediate: true },
        );
    }

    /**
     * Depreciated: Use the liveData() getter instead.
     * Get the live query data as a Vue ref array
     */
    public toArrayAsRef() {
        console.warn("ApiLiveQuery.toArrayAsRef() is deprecated. Use liveData instead.");
        return this._liveData;
    }

    /**
     * Get the live query data as a Vue ref array.
     */
    public get liveData() {
        return this._liveData;
    }

    /**
     * Get the live query data as a Vue ref - returns the first result.
     */
    public get liveItem() {
        return this._firstItem;
    }

    /**
     * Depreciated: Use the liveItem() getter instead.
     * Get the live query data as a Vue ref object. If multiple items are available, only the first one is returned.
     */
    public toRef() {
        console.warn("ApiLiveQuery.toRef() is deprecated. Use liveItem instead.");
        return this._firstItem;
    }

    /**
     * Depreciated: Use the isLoading() getter instead.
     * A Vue ref that indicates if the live query is loading data. It will be true when the data is being fetched from the API.
     */
    public isLoadingAsRef() {
        console.warn("ApiLiveQuery.isLoadingAsRef() is deprecated. Use isLoading instead.");
        return this._isLoading;
    }

    /**
     * A Vue ref that indicates if the live query is loading data. It will be true when the data is being fetched from the API.
     */
    public get isLoading() {
        return this._isLoading;
    }

    /**
     * Stop listening for live updates from the API. After stopLiveQuery is called, the data will not be updated anymore.
     */
    stopLiveQuery() {
        this.unsubscribeLiveData();
        if (this._unwatch) this._unwatch();
    }

    /**
     * Stop listening for live updates
     */
    private unsubscribeLiveData() {
        if (this._socketOnCallback) getSocket().off("data", this._socketOnCallback);
        this._socketOnCallback = undefined;
    }

    /**
     * Get a Vue ref that contains the editable version of the data. This allows you to modify the data but does not save it to the database.
     */
    public get editable() {
        if (!this._editable) {
            throw new Error(
                "Editable data is not available. The class should be instantiated with the option `enableEditable: true`.",
            );
        }
        return this._editable as Ref<Array<T>>;
    }

    /**
     * Save the current state of an editable item to the database.
     * This method will not save the item if it has not been modified.
     * @param id - The _id of the item to save.
     */
    public async save(id: Uuid) {
        if (!this._isEdited || !this._editable) {
            throw new Error(
                "Editable data is not available. The class should be instantiated with the option `enableEditable: true`.",
            );
        }

        if (!this._isEdited.value(id)) return { ack: AckStatus.Accepted };

        const item = this._editable.value.find((i) => i._id === id);
        if (!item) return { ack: AckStatus.Rejected, message: "Item not found" };

        // Send the change request to the API
        const res = await getRest().changeRequest({
            id: 10, // TODO: The ID field is not used in the API, but it is still required by the API. This can be removed in the future.
            doc: item,
        } as ChangeRequestQuery);

        if (res && res.ack == AckStatus.Accepted) {
            // Update the shadow copy
            const index = this._editable.value.findIndex((i) => i._id === id);
            if (index !== -1) this._editable.value[index] = item;
        }

        return res; // TODO: Add type for the response. This will involve adding a type for the API response.
    }

    /**
     * Revert an item to its original state from the source data.
     * @param id - The _id of the item to revert.
     */
    public get revert() {
        if (!this._revert) {
            throw new Error(
                "Editable data is not available. The class should be instantiated with the option `enableEditable: true`.",
            );
        }
        return this._revert;
    }

    /**
     * Check if an item is in the edited state.
     * @returns a computed function giving true if the passed item has been edited, false otherwise.
     */
    public get isEdited() {
        if (!this._isEdited)
            throw new Error(
                "Editable data is not available. The class should be instantiated with the option `enableEditable: true`.",
            );
        return this._isEdited;
    }

    /**
     * Check if an item is in the modified state. The modified state means that the item has been edited by the user and has also been modified in the source array.
     * @returns a computed function giving true if the passed item has been modified, false otherwise.
     */
    public get isModified() {
        if (!this._isModified)
            throw new Error(
                "Editable data is not available. The class should be instantiated with the option `enableEditable: true`.",
            );
        return this._isModified;
    }
}
