export const loadPlugins = async (): Promise<void> => {
    if (!import.meta.env.VITE_PLUGINS) return;

    try {
        const names: string[] = JSON.parse(import.meta.env.VITE_PLUGINS);
        await Promise.all(names.map((name) => loadPlugin(name)));
    } catch (err: any) {
        console.error("Failed to parse VITE_PLUGINS:", err.message);
    }
};

const loadPlugin = async (name: string): Promise<void> => {
    if (!name) return;

    try {
        const module = await import(`../plugins/${name}.ts`);
        const PluginClass = module[name];

        if (!PluginClass) {
            console.error(`Plugin "${name}" not found or has no matching named export.`);
            return;
        }

        new PluginClass();
    } catch (err: any) {
        console.error(`Failed to load plugin "${name}":`, err.message);
    }
};
