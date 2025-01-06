import { apiConnectionOptions } from "../types";
import { getSocket } from "../socket/socketio";
import { getRest } from "../rest/RestApi";

let _options: apiConnectionOptions;

export function api(options?: apiConnectionOptions): any {
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
