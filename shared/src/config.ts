export type SharedConfigT = {
    cms: boolean;
};

export class Configuration {
    private config: SharedConfigT;

    constructor(conf: SharedConfigT) {
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

export function init(newConfig: SharedConfigT) {
    config.setConfig(newConfig);
}
