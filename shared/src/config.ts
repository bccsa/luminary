export type SharedConfig = {
    cms: boolean;
};

export class Configuration {
    private config: SharedConfig | undefined = undefined;

    public setConfig(config: SharedConfig) {
        this.config = config;
    }

    public getConfig() {
        return this.config;
    }
}

export const config: Configuration = new Configuration();

export function init(newConfig: SharedConfig) {
    config.setConfig(newConfig);
}
