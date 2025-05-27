import { computed, ComputedRef, readonly, Ref, ref, watch } from "vue";
import { ApiSearchQuery, ChangeRequestQuery, getRest } from "../../rest/RestApi";
import { getSocket, isConnected } from "../../socket/socketio";
import { AckStatus, ApiQueryResult, BaseDocumentDto, Uuid } from "../../types";
import { applySocketData } from "./applySocketData";
import { createEditable } from "./createEditable";

export type ApiLiveQueryOptions<T> = {
    /** Provide an initial value while waiting for the API response */
    initialValue?: T;
    /** When true, return an array with results. When false, return only the first result. Default = true */
    returnArray?: boolean;
};

/**
 * ApiLiveQuery is a wrapper around the REST API and socket.io to provide a live query
 * functionality. It allows you to subscribe to a query and get live updates when the data
 * changes. It uses Vue's reactivity system to provide a reactive API.
 * @param query The query to subscribe to. It should be a valid ApiSearchQuery object.
 * @param options Options for the live query. It can contain an initial value for the data.
 * @returns A Vue ref that contains the data from the query. The data will be updated
 * automatically when the data changes in the database.
 */
export class ApiLiveQuery<T extends BaseDocumentDto> {
    private _dataAsRef: Ref<Array<T>>;
    private _firstItemAsRef: ComputedRef<T | undefined>;
    private _returnArray: boolean;
    private _socketOnCallback: ((data: ApiQueryResult<T>) => void) | undefined = undefined;
    private _unwatch;
    private _isLoading = ref(true);
    private _editable: Ref<Array<T>> | undefined = undefined;
    private _edited: ComputedRef<Array<T>> | undefined = undefined;
    private _modified: ComputedRef<Array<T>> | undefined = undefined;

    constructor(query: Ref<ApiSearchQuery>, options?: ApiLiveQueryOptions<Array<T>>) {
        if (!options) options = {};
        if (options.returnArray === undefined) options.returnArray = true;
        this._returnArray = options.returnArray;

        // Validate the query
        if (query.value.groups) {
            throw new Error("groups are not supported in ApiLiveQuery");
        }

        if (query.value.queryString) {
            throw new Error("queryString is not implemented yet");
        }

        this._dataAsRef = ref((options?.initialValue as Array<T>) ?? ([] as Array<T>)) as Ref<
            Array<T>
        >;

        this._firstItemAsRef = computed(() => {
            if (!this._dataAsRef || !this._dataAsRef.value || !this._dataAsRef.value.length)
                return undefined;
            return this._dataAsRef.value[0];
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
                        this._dataAsRef.value = result.docs as Array<T>;
                    })
                    .catch((error) => {
                        console.error("Error fetching data from API:", error);
                    })
                    .finally(() => {
                        this._isLoading.value = false;
                    });

                // Listen for updates from the socket
                this._socketOnCallback = (data) =>
                    applySocketData<T>(data, this._dataAsRef, query.value);
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
        return readonly(this._dataAsRef);
    }

    /**
     * Get the live query data as a Vue ref array.
     */
    public get liveData() {
        if (this._returnArray) return readonly(this._dataAsRef);
        return readonly(this._firstItemAsRef);
    }

    /**
     * Depreciated: Use the liveData() getter instead for ApiLiveQuery instances with the returnArray option set to false.
     * Get the live query data as a Vue ref object. If multiple items are available, only the first one is returned.
     */
    public toRef() {
        console.warn(
            "ApiLiveQuery.toRef() is deprecated. Use liveData instead with the returnArray option set to false when instantiating ApiLiveQuery.",
        );
        return this._firstItemAsRef;
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

    private createEditable() {
        if (!this._editable || !this._edited || !this._modified) {
            const e = createEditable<T>(this._dataAsRef);
            this._editable = e.editable;
            this._edited = e.edited;
            this._modified = e.modified;
        }
    }

    /**
     * Get a Vue ref that contains the editable version of the data. This allows you to modify the data but does not save it to the database.
     */
    public get editable() {
        this.createEditable();
        return this._editable as Ref<Array<T>>;
    }

    /**
     * Get a Vue ref that contains the items that have been edited by the user. This is a subset of the editable items.
     */
    public get edited() {
        this.createEditable();
        return this._edited as ComputedRef<Array<T>>;
    }

    /**
     * Get a Vue ref that contains the items that have been modified in the source data. This is a subset of the source items.
     */
    public get modified() {
        this.createEditable();
        return this._modified as ComputedRef<Array<T>>;
    }

    /**
     * Save the current state of an editable item to the database.
     * This method will not save the item if it has not been modified.
     * @param id - The _id of the item to save.
     */
    public async save(id: Uuid) {
        if (!this._editable || !this._edited) {
            throw new Error("Editable data is not available. Call editable first.");
        }

        const item = this._edited.value.find((i) => i._id === id);
        if (!item) return { ack: AckStatus.Accepted };

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
}
