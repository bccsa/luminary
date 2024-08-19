export type SharedConfigT = {
    cms: boolean | undefined;
};

export class Configuration {
    private config: SharedConfigT;

    constructor(conf: SharedConfigT) {
        console.log("Configuration Initialized");
        this.config = conf;
    }

    public setConfig(newConfig: SharedConfigT) {
        this.config = newConfig;
    }

    public getConfig() {
        return this.config;
    }

    public getCmsFlag() {
        return this.config.cms;
    }
}

export const config: Configuration = new Configuration({ cms: true });

export function initializeConfig(newConfig: SharedConfigT) {
    config.setConfig(newConfig);
}
