export type SharedConfig = {
    cms: boolean;
};

export let config: SharedConfig;

export function initConfig(newConfig: SharedConfig) {
    config = newConfig;
}
