import { ApiConnectionOptions } from "../types";
import { getSocket } from "../socket/socketio";
import { getRest } from "../rest/RestApi";

let _options: ApiConnectionOptions;

export function api(options?: ApiConnectionOptions): any {
    if (options) _options = options;
    return {
        socket: () => {
            const socket = getSocket(options || _options);
            return socket;
        },

        rest: () => {
            const rest = getRest(options || _options);
            return rest;
        },
    };
}
