export type SharedConfig = {
    cms: boolean;
    docsIndex: string;
};

export let config: SharedConfig;

export function initConfig(newConfig: SharedConfig) {
    config = newConfig;
}
