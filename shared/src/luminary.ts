import { type SharedConfigT, config } from "./config";

export function init(init: SharedConfigT) {
    config.setConfig({ cms: init.cms });
}
