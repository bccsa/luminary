import { type SharedConfig, config } from "./config";

export function init(configP: SharedConfig) {
    config.setConfig({ cms: configP.cms });
}
