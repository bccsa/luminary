import { expect, test, type Page } from '@playwright/test';

// The control layout is v10's own; the Video.js 8 player has different chrome.
test.skip(process.env.ENGINE !== 'v10', 'controls specific to the Video.js 10 player');

const FIXTURES = `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 5191}`;
const STORAGE_KEY = 'luminary-legacy-player-demo';

async function open(page: Page, { extra = '', size = { width: 1100, height: 760 } } = {}) {
    await page.setViewportSize(size);
    await page.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [STORAGE_KEY, { bare: false }] as const);
    await page.goto(`/?master=${encodeURIComponent(`${FIXTURES}/clear/master.m3u8`)}&embed=1&thumbs=1${extra}`);
    await expect(page.locator('.lmpl-root video, .lmpl-root hlsjs-video').first()).toBeAttached();
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.duration), { timeout: 15_000 }).toBeGreaterThan(5);
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.lmpl-root.lmpl-has-thumbs')).toBeAttached({ timeout: 15_000 });
}

const wake = async (page: Page) => {
    const box = (await page.locator('.lmpl-root').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5);
};

const paused = (page: Page) => page.locator('video').evaluate((v: HTMLVideoElement) => v.paused);

async function startPlaying(page: Page) {
    await wake(page);
    await page.locator('.lmpl-play').click();
    await expect.poll(() => paused(page)).toBe(false);
    await wake(page);
}

async function holdOnBar(page: Page, ratio = 0.3) {
    const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
    await page.mouse.move(bar.x + bar.width * ratio, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width * (ratio + 0.05), bar.y + bar.height / 2, { steps: 4 });
    await expect(page.locator('.lmpl-roster')).toBeVisible();
    // Past the 0.18 s the timeline takes to lift onto the strip.
    await page.waitForTimeout(400);
}

test.describe('the roster under a held timeline', () => {
    test('starts where the track ends, covering none of it', async ({ page }) => {
        await open(page);
        await startPlaying(page);
        await holdOnBar(page);
        const track = (await page.locator('.lmpl-time-slider .lmpl-track').boundingBox())!;
        const roster = (await page.locator('.lmpl-roster').boundingBox())!;
        const overlap = track.y + track.height - roster.y;
        expect(overlap).toBeLessThanOrEqual(0.5);
        // And it does not float above it either.
        expect(overlap).toBeGreaterThanOrEqual(-1.5);
        await page.mouse.up();
    });

    test('holds the video still while it is held, and plays on when it is let go', async ({ page }) => {
        await open(page);
        await startPlaying(page);
        await holdOnBar(page);
        expect(await paused(page)).toBe(true);
        const held = await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);
        await page.waitForTimeout(600);
        // Held still: the playhead did not move under the finger.
        expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(held, 1);
        await page.mouse.up();
        await expect.poll(() => paused(page)).toBe(false);
    });

    test('leaves a video that was paused paused', async ({ page }) => {
        await open(page);
        await wake(page);
        expect(await paused(page)).toBe(true);
        await holdOnBar(page);
        await page.mouse.up();
        await page.waitForTimeout(400);
        expect(await paused(page)).toBe(true);
    });
});

test.describe('the up next strip', () => {
    async function fullscreenAtEnd(page: Page) {
        await wake(page);
        await page.locator('.lmpl-fullscreen-button, media-fullscreen-button').first().click();
        await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
        // The strip is offered in a video's last ten seconds only.
        await page.locator('video').evaluate((v: HTMLVideoElement) => { v.currentTime = 8; });
        await wake(page);
        await expect(page.locator('.lmpl-nextup')).toBeVisible();
        await page.waitForTimeout(500);
    }

    const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;

    test('rides above the chapter line, not over it', async ({ page }) => {
        await open(page, { extra: '&chapters=1&nextup=3' });
        await fullscreenAtEnd(page);
        await expect(page.locator('.lmpl-chapter-now')).toBeVisible();
        const strip = await box(page, '.lmpl-nextup');
        const chapter = await box(page, '.lmpl-chapter-now');
        expect(strip.y + strip.height).toBeLessThanOrEqual(chapter.y + 0.5);
    });

    test('does not cover the play button, on a short screen', async ({ page }) => {
        await open(page, { extra: '&chapters=1&nextup=3', size: { width: 900, height: 420 } });
        await fullscreenAtEnd(page);
        const strip = await box(page, '.lmpl-nextup');
        const play = await box(page, '.lmpl-play');
        const apart =
            strip.x >= play.x + play.width ||
            strip.x + strip.width <= play.x ||
            strip.y >= play.y + play.height ||
            strip.y + strip.height <= play.y;
        expect(apart).toBe(true);
    });
});
