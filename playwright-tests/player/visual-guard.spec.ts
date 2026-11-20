import { expect, test, type Page } from '@playwright/test';

/**
 * A pixel guard for the controls' stylesheet: every state of the controls, with the picture masked, against
 * screenshots taken earlier. It exists for changes that should not alter a pixel — trimming the skin's CSS to
 * the rules the player uses, say — and a local tool rather than a test: screenshots differ between macOS and
 * Linux, so the baseline cannot be committed.
 *
 *     SNAPSHOT_DIR=/some/dir ENGINE=v10 npx playwright test --project=chromium e2e/visual-guard.spec.ts --update-snapshots
 *     (change the code)
 *     SNAPSHOT_DIR=/some/dir ENGINE=v10 npx playwright test --project=chromium e2e/visual-guard.spec.ts
 */
test.skip(process.env.ENGINE !== 'v10', 'v10 only');
test.skip(!process.env.SNAPSHOT_DIR, 'a local tool: set SNAPSHOT_DIR to a baseline folder (see the comment above)');
test.use({ screenshot: 'off' });

const F = 'http://127.0.0.1:' + (process.env.FIXTURE_PORT ?? 5191);
const NATIVE_KEY = '6c756d696e6172792d737069a4e2c0de';

async function open(page: Page, fixture: string, width: number, extra = '') {
    await page.setViewportSize({ width, height: Math.round(width * 0.62) });
    await page.goto('/?master=' + encodeURIComponent(F + '/' + fixture + '/master.m3u8') + extra + '&embed=1');
    if (width > 1200) await page.addStyleTag({ content: 'main.demo { max-width: none !important; padding: 0 !important; } .lmpl-root { border-radius: 0 !important; }' });
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(3);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.pause(); v.currentTime = 3; });
    await page.waitForTimeout(500);
}
const wake = async (page: Page) => {
    const b = (await page.locator('.lmpl-root').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.move(b.x + b.width / 2 + 4, b.y + b.height / 2 + 4);
    await page.waitForTimeout(500);
};
const shot = (page: Page, name: string) =>
    expect(page.locator('.lmpl-root')).toHaveScreenshot(name + '.png', { mask: [page.locator('hlsjs-video')], maxDiffPixels: 0, animations: 'disabled' });

test('idle controls', async ({ page }) => { await open(page, 'clear', 1000); await wake(page); await shot(page, 'idle'); });
test('multi-language, all four settings', async ({ page }) => { await open(page, 'native', 1000, '&key=' + NATIVE_KEY); await wake(page); await shot(page, 'native-idle'); });
test('quality card', async ({ page }) => { await open(page, 'clear', 1000); await wake(page); await page.locator('.lmpl-opt-quality').click(); await page.waitForTimeout(700); await shot(page, 'quality-card'); });
test('language card', async ({ page }) => { await open(page, 'native', 1000, '&key=' + NATIVE_KEY); await wake(page); await page.locator('.lmpl-opt-audio').click(); await page.waitForTimeout(700); await shot(page, 'language-card'); });
test('speed card', async ({ page }) => { await open(page, 'clear', 1000); await wake(page); await page.locator('.lmpl-opt-speed').click(); await page.waitForTimeout(700); await shot(page, 'speed-card'); });
test('volume card', async ({ page }) => { await open(page, 'clear', 1000); await wake(page); await page.locator('video').evaluate((v: HTMLVideoElement) => { v.volume = 0.6; }); await page.locator('.lmpl-mute').hover(); await page.waitForTimeout(800); await shot(page, 'volume-card'); });
test('scrub preview', async ({ page }) => {
    await open(page, 'clear', 1000, '&thumbs=1');
    await expect(page.locator('.lmpl-root.lmpl-has-thumbs')).toBeAttached();
    await wake(page);
    const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
    await page.mouse.move(bar.x + bar.width * 0.5, bar.y + bar.height / 2); await page.waitForTimeout(700); await shot(page, 'scrub');
});
test('timeline hover without thumbnails', async ({ page }) => {
    await open(page, 'clear', 1000, '&thumbs=0'); await wake(page);
    const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
    await page.mouse.move(bar.x + bar.width * 0.4, bar.y + bar.height / 2); await page.waitForTimeout(700); await shot(page, 'timeline-hover');
});
test('large player', async ({ page }) => { await open(page, 'native', 2000, '&key=' + NATIVE_KEY); await wake(page); await shot(page, 'large'); });
test('large player, language card', async ({ page }) => { await open(page, 'native', 2000, '&key=' + NATIVE_KEY); await wake(page); await page.locator('.lmpl-opt-audio').click(); await page.waitForTimeout(700); await shot(page, 'large-card'); });
test('phone width', async ({ page }) => { await open(page, 'clear', 430); await wake(page); await shot(page, 'phone'); });
test('bare windowed frame', async ({ page }) => { await page.addInitScript(() => localStorage.setItem('luminary-legacy-player-demo', JSON.stringify({ bare: true }))); await open(page, 'clear', 1000); await wake(page); await shot(page, 'bare'); });
test('playing', async ({ page }) => { await open(page, 'clear', 1000); await wake(page); await page.locator('.lmpl-play').click(); await page.waitForTimeout(300); await page.locator('video').evaluate((v: HTMLVideoElement) => { v.pause(); v.currentTime = 3; }); await wake(page); await shot(page, 'paused-after-play'); });
