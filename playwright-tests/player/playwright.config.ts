import { defineConfig, devices } from '@playwright/test';

// The specs skip themselves unless `process.env.ENGINE` is `v10`, the Video.js 10 player they were written for.
process.env.ENGINE ??= 'v10';
const demoPort = 5182;
/**
 * The tests get a fixture server of their own. They arm faults, reset the simulated live stream and clear the
 * request log, which would reach into anyone looking at the same server in a browser (the compare page uses
 * 5190), and be reached into by it.
 */
const fixturePort = process.env.FIXTURE_PORT ?? '5191';

export default defineConfig({
    testDir: '.',
    // Pixel baselines are taken per run (see visual-guard.spec.ts) and kept out of the repository.
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
            command: 'node fixtures/serve.mjs',
            env: { FIXTURE_PORT: fixturePort },
            url: `http://127.0.0.1:${fixturePort}/__log`,
            reuseExistingServer: true,
        },
        {
            // The app's player, compiled from source by the app's demo server.
            command: 'npm --prefix ../../app run player:demo',
            url: `http://127.0.0.1:${demoPort}`,
            reuseExistingServer: true,
        },
    ],
});
