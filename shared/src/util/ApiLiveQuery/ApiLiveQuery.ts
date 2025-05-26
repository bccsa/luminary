import { computed, Ref, ref, watch } from "vue";
import { ApiSearchQuery, getRest } from "../../rest/RestApi";
import { getSocket, isConnected } from "../../socket/socketio";
import { ApiQueryResult, BaseDocumentDto } from "../../types";
import { applySocketData } from "./applySocketData";

export type ApiLiveQueryOptions<T> = {
    initialValue?: T;
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
    private dataAsRef: Ref<Array<T> | undefined>;
    private socketOnCallback: ((data: ApiQueryResult<T>) => void) | undefined = undefined;
    private unwatch;
    private isLoading = ref(true);

    /**
     * Get the live query data as a Vue ref array
     */
    public toArrayAsRef() {
        return this.dataAsRef;
    }

    /**
     * Get the live query data as a Vue ref object. If multiple items are available, only the first one is returned.
     */
    public toRef() {
        return computed(() => {
            if (!this.dataAsRef.value || !this.dataAsRef.value.length) return undefined;
            return this.dataAsRef.value[0];
        });
    }

    /**
     * A Vue ref that indicates if the live query is loading data. It will be true when the data is being fetched from the API.
     */
    public isLoadingAsRef() {
        return this.isLoading;
    }

    constructor(query: Ref<ApiSearchQuery>, options?: ApiLiveQueryOptions<Array<T>>) {
        // Validate the query
        if (query.value.groups) {
            throw new Error("groups are not supported in ApiLiveQuery");
        }

        if (query.value.queryString) {
            throw new Error("queryString is not implemented yet");
        }

        this.dataAsRef = ref<Array<T> | undefined>(options?.initialValue) as Ref<
            Array<T> | undefined
        >;

        // Fetch initial data from the REST API and subscribe to live updates
        this.unwatch = watch(
            [query, isConnected],
            () => {
                this.unsubscribeLiveData();

                if (!isConnected.value) {
                    this.isLoading.value = false;
                    return;
                }

                this.isLoading.value = true;

                getRest()
                    .search(query.value)
                    .then((result) => {
                        this.dataAsRef.value = result.docs as Array<T>;
                    })
                    .catch((error) => {
                        console.error("Error fetching data from API:", error);
                    })
                    .finally(() => {
                        this.isLoading.value = false;
                    });

                // Listen for updates from the socket
                this.socketOnCallback = (data) =>
                    applySocketData<T>(data, this.dataAsRef, query.value);
                getSocket().on("data", this.socketOnCallback);
            },
            { immediate: true },
        );
    }

    /**
     * Stop listening for live updates from the API. After stopLiveQuery is called, the data will not be updated anymore.
     */
    stopLiveQuery() {
        this.unsubscribeLiveData();
        if (this.unwatch) this.unwatch();
    }

    /**
     * Stop listening for live updates
     */
    private unsubscribeLiveData() {
        if (this.socketOnCallback) getSocket().off("data", this.socketOnCallback);
        this.socketOnCallback = undefined;
    }
}
