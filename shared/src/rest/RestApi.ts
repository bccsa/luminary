import { ApiConnectionOptions } from "../types";
import { Sync } from "./sync";

class RestApi {
    private docs: Sync;
    /**
     * Create a new docs instance
     * @param options - Options
     */
    constructor(options: ApiConnectionOptions) {
        this.docs = new Sync(options);
    }

    async clientDataReq() {
        this.docs.clientDataReq();
    }
}

let rest: RestApi;

/**
 * Returns a singleton instance of the restApi client class. The api URL, token and CMS flag is only used when calling the function for the first time.
 * @param options - Socket connection options
 */
export function getRest(options?: ApiConnectionOptions) {
    if (rest) return rest;

    if (!options) {
        throw new Error("Rest API connection requires options object");
    }
    if (!options.apiUrl) {
        throw new Error("Rest API connection requires an API URL");
    }
    if (!options.docTypes || !options.docTypes[0]) {
        throw new Error(
            "Rest API connection requires an array of DocTypes that needs to be synced",
        );
    }

    rest = new RestApi(options);

    return rest;
}
