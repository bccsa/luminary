import { socketConnectionOptions } from "../types";
import { getSocket } from "../socket/socketio";
import { getRest } from "../rest/rest";

let _options: socketConnectionOptions;

export function api(options?: socketConnectionOptions): any {
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
