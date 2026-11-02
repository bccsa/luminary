import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { vuePlugin } from './vite.config';

/** Dev server for the test harness in `demo/`; workspace libraries resolve to source, so no build is needed. */
export default defineConfig({
    root: resolve(__dirname, 'demo'),
    plugins: [vuePlugin()],
    resolve: {
        alias: {
            '@luminary-media-converter/player-core': resolve(__dirname, '../player-core/src/index.ts'),
            '@luminary-media-converter/hls-core': resolve(__dirname, '../hls-core/src/index.ts'),
        },
        dedupe: ['vue'],
    },
    server: { host: '127.0.0.1', port: 5182, strictPort: true },
});
