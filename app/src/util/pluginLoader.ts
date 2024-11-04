/**
 * Dynamic plugin loading
 * @returns
 */
export const loadPlugins = async () => {
    if (!import.meta.env.VITE_PLUGINS) return;

    const _p: string[] = JSON.parse(import.meta.env.VITE_PLUGINS);

    const _a: any = [];
    _p.forEach(async (p) => {
        _a.push(dynamicLoadPlugin(p));
    });

    await Promise.all(_a);
};

export const dynamicLoadPlugin = async (p: string) => {
    if (!p) return;

    try {
        const c = await import(`../plugins/${p}.ts`);

        if (!c || !c[p]) {
            console.log(`Plugin ${p} does not exists or does not have a constructor.`);
            return;
        }

        const _c = new c[p]();

        return _c;
    } catch (err: any) {
        console.log(err.message);
    }
};
