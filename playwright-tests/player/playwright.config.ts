import { defineConfig, devices } from '@playwright/test';

/**
 * `ENGINE=v10|v8` picks which player the specs drive: v10 is `player-web`, the main one and the default; v8 is the
 * frozen `player-web-v8`, kept as a baseline to compare against. The specs themselves are engine-neutral.
 */
// The specs read `process.env.ENGINE` too, and skip themselves when it is not `v10`.
process.env.ENGINE ??= 'v10';
const engine = process.env.ENGINE;
const demoPort = engine === 'v8' ? 5183 : 5182;
/**
 * The tests get a fixture server of their own. They arm faults, reset the simulated live stream and clear the
 * request log, which would reach into anyone looking at the same server in a browser (the compare page uses
 * 5190), and be reached into by it.
 */
const fixturePort = process.env.FIXTURE_PORT ?? '5191';

export default defineConfig({
    testDir: 'e2e',
    // Pixel baselines are taken per run (see zz-visual.spec.ts) and kept out of the repository.
    snapshotPathTemplate: process.env.SNAPSHOT_DIR ? process.env.SNAPSHOT_DIR + '/{arg}-{projectName}{ext}' : '{testDir}/__screenshots__/{arg}-{projectName}{ext}',
    testMatch: '**/*.spec.ts',
    timeout: 60_000,
    workers: 1,
    reporter: [['list']],
    use: { baseURL: `http://127.0.0.1:${demoPort}`, trace: 'retain-on-failure' },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
    webServer: [
        {
            command: 'node e2e/fixtures/serve.mjs',
            env: { FIXTURE_PORT: fixturePort },
            url: `http://127.0.0.1:${fixturePort}/__log`,
            reuseExistingServer: true,
        },
        {
            // Built first for the main player: `built.spec.ts` drives the library as an app gets it, not the source.
            command: engine === 'v8' ? 'npm --prefix ../player-web-v8 run demo' : 'npm run build:lib && npm run demo',
            url: `http://127.0.0.1:${demoPort}`,
            reuseExistingServer: true,
        },
    ],
});
