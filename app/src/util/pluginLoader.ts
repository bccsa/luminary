import type { App } from "vue";

/**
 * Interface that external runtime plugins should implement.
 * A plugin may optionally be a Vue plugin by implementing install().
 */
export interface LuminaryPlugin {
    install?(app: App): void;
}

/**
 * Loads all plugins listed in VITE_PLUGINS and registers them with the Vue app.
 * Plugin files are resolved from src/plugins/<name>.ts at build time via the
 * Vite plugin that copies files from VITE_PLUGIN_PATH into that directory.
 */
export const loadPlugins = async (app: App): Promise<void> => {
    if (!import.meta.env.VITE_PLUGINS) return;

    try {
        const names: string[] = JSON.parse(import.meta.env.VITE_PLUGINS);
        await Promise.all(names.map((name) => loadPlugin(app, name)));
    } catch (err: any) {
        console.error("Failed to parse VITE_PLUGINS:", err.message);
    }
};

const loadPlugin = async (app: App, name: string): Promise<void> => {
    if (!name) return;

    try {
        const module = await import(`../plugins/${name}.ts`);
        const PluginClass = module[name];

        if (!PluginClass) {
            console.error(`Plugin "${name}" not found or has no matching named export.`);
            return;
        }

        const instance: LuminaryPlugin = new PluginClass();

        if (typeof instance.install === "function") {
            app.use({ install: (a) => instance.install!(a) });
        }
    } catch (err: any) {
        console.error(`Failed to load plugin "${name}":`, err.message);
    }
};
