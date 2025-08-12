import { computed, ComputedRef, Ref, ref, watch } from "vue";
import { ApiSearchQuery, getRest } from "../../rest/RestApi";
import { getSocket, isConnected } from "../../socket/socketio";
import { ApiQueryResult, BaseDocumentDto } from "../../types";
import { applySocketData } from "./applySocketData";

export type ApiLiveQueryOptions<T> = {
    /** Provide an initial value while waiting for the API response */
    initialValue?: Array<T>;
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
    protected _sourceData: Ref<Array<T>>;
    protected _firstItem: ComputedRef<T | undefined>;
    protected _liveData: ComputedRef<Array<T>>;
    private _socketOnCallback: ((data: ApiQueryResult<T>) => void) | undefined = undefined;
    private _unwatch;
    private _isLoading = ref(true);

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
                this._socketOnCallback = (data) => {
                    applySocketData<T>(data, this._sourceData, query.value);
                };
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
}
