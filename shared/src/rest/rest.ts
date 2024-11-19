import { httpReq } from "./http";
import { socketConnectionOptions } from "../types";
import { db } from "../db/database";
import { accessMap } from "../permissions/permissions";

class restAPi {
    private http: httpReq;
    private isCms: boolean;
    /**
     * Create a new socketio instance
     * @param apiUrl - Socket.io endpoint URL
     * @param cms - CMS mode flag
     * @param token - Access token
     */
    constructor(apiUrl: string, cms: boolean = false, token?: string) {
        this.isCms = cms;
        this.http = new httpReq(apiUrl, token);
    }

    async clientDataReq() {
        const data = await this.http.post("docs", {
            apiVersion: "test2",
            memberOf: ["group-private-users", "group-super-admins"],
            userId: "user-super-admin",
            reqData: {
                version: db.syncVersion,
                cms: this.isCms,
                accessMap: accessMap.value,
            },
        });

        if (data) await db.bulkPut(data.docs);
        if (data && data.version != undefined) db.syncVersion = data.version;
    }
}

let rest: restAPi;

/**
 * Returns a singleton instance of the restApi client class. The api URL, token and CMS flag is only used when calling the function for the first time.
 * @param options - Socket connection options
 */
export function getRest(options?: socketConnectionOptions) {
    if (rest) return rest;

    if (!options) {
        throw new Error("Rest API connection requires options object");
    }
    if (!options.apiUrl) {
        throw new Error("Rest API connection requires an API URL");
    }
    if (!options.cms) options.cms = false;

    rest = new restAPi(options.apiUrl, options.cms, options.token);

    return rest;
}
