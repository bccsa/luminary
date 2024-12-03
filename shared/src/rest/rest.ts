import { apiConnectionOptions } from "../types";
import { docs } from "../docs/docs";

class restAPi {
    private docs: docs;
    /**
     * Create a new socketio instance
     * @param options - Options
     */
    constructor(options: apiConnectionOptions) {
        this.docs = new docs(options);
    }

    async clientDataReq() {
        this.docs.clientDataReq();
    }
}

let rest: restAPi;

/**
 * Returns a singleton instance of the restApi client class. The api URL, token and CMS flag is only used when calling the function for the first time.
 * @param options - Socket connection options
 */
export function getRest(options?: apiConnectionOptions) {
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
    if (!options.cms) options.cms = false;

    rest = new restAPi(options);

    return rest;
}
