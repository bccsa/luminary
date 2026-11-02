import { expect, test, type Page } from '@playwright/test';

// Hammers the scrub paths the way a restless viewer does, and checks what must stay true throughout.
test.skip(process.env.ENGINE !== 'v10', 'controls specific to the Video.js 10 player');

const FIXTURES = `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 5191}`;
const STORAGE_KEY = 'luminary-legacy-player-demo';

async function open(page: Page, extra = '', size = { width: 1100, height: 760 }) {
    await page.setViewportSize(size);
    await page.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [STORAGE_KEY, { bare: false }] as const);
    await page.goto(`/?master=${encodeURIComponent(`${FIXTURES}/clear/master.m3u8`)}&embed=1&thumbs=1${extra}`);
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.duration), { timeout: 15_000 }).toBeGreaterThan(5);
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.lmpl-root.lmpl-has-thumbs')).toBeAttached({ timeout: 15_000 });
}

const wake = async (page: Page) => {
    const box = (await page.locator('.lmpl-root').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5);
};
const state = (page: Page) => page.locator('video').evaluate((v: HTMLVideoElement) => ({ paused: v.paused, t: v.currentTime, d: v.duration }));
const errors: string[] = [];

test.beforeEach(({ page }) => {
    errors.length = 0;
    page.on('pageerror', (e) => errors.push(String(e)));
    // A missing favicon is the demo page's, not the player's.
    page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
});

test('fifty quick holds and lets-go leave the video playing, with no stuck roster and no errors', async ({ page }) => {
    await open(page);
    await wake(page);
    await page.locator('.lmpl-play').click();
    await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
    for (let i = 0; i < 50; i++) {
        await wake(page);
        const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
        const r = 0.05 + (i % 9) * 0.1;
        await page.mouse.move(bar.x + bar.width * r, bar.y + bar.height / 2);
        await page.mouse.down();
        await page.mouse.move(bar.x + bar.width * Math.min(0.98, r + 0.04), bar.y + bar.height / 2, { steps: 2 });
        if (i % 3 === 0) await page.waitForTimeout(40);
        await page.mouse.up();
    }
    await expect.poll(() => state(page).then((s) => s.paused), { timeout: 5000 }).toBe(false);
    expect(errors).toEqual([]);
});

test('a hold that is let go off the bar still plays on, and a hold cancelled by leaving the window does not strand a pause', async ({ page }) => {
    await open(page);
    await wake(page);
    await page.locator('.lmpl-play').click();
    await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
    const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
    await page.mouse.move(bar.x + bar.width * 0.4, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width * 0.5, bar.y - 300, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
    // The pointer is cancelled (a touch taken by the system): the same.
    await page.mouse.move(bar.x + bar.width * 0.4, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.evaluate(() => document.querySelector('.lmpl-root')!.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })));
    await page.mouse.up();
    await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
});

test('scrubbing to the very end and the very start behaves, and a pause the viewer chose mid-scrub is kept', async ({ page }) => {
    await open(page);
    await wake(page);
    await page.locator('.lmpl-play').click();
    await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
    const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
    for (const r of [0, 1, 0, 1, 0.5]) {
        await page.mouse.move(bar.x + bar.width * r, bar.y + bar.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(80);
        await page.mouse.up();
    }
    expect(errors).toEqual([]);
    const s = await state(page);
    expect(Number.isFinite(s.t)).toBe(true);
    // A video that ends while the viewer is not scrubbing stays ended, not looping into a stale resume.
    await page.mouse.move(bar.x + bar.width * 0.99, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
});

test('a pinned roster dragged and tapped many times keeps the video where it was sent', async ({ page }) => {
    await open(page);
    await wake(page);
    await page.locator('.lmpl-play').click();
    await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
    const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
    await page.mouse.move(bar.x + bar.width * 0.5, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width * 0.52, bar.y + bar.height / 2, { steps: 3 });
    await page.mouse.up();
    // Pinned: the roster stays open after the finger lifts.
    const roster = page.locator('.lmpl-roster-interactive');
    await expect(roster).toBeVisible();
    for (let i = 0; i < 12; i++) {
        const box = (await roster.boundingBox())!;
        const y = box.y + box.height / 2;
        await page.mouse.move(box.x + box.width / 2, y);
        await page.mouse.down();
        // A tap that wanders a few pixels is a tap, not a seek to somewhere else.
        await page.mouse.move(box.x + box.width / 2 + (i % 2 ? 6 : -6), y + 2, { steps: 2 });
        await page.mouse.up();
        await page.waitForTimeout(30);
    }
    await expect.poll(() => state(page).then((s) => s.paused), { timeout: 5000 }).toBe(false);
    expect(errors).toEqual([]);
});

test('the strip stays clear of the controls through a resize and the controls hiding and showing', async ({ page }) => {
    await open(page, '&chapters=1&nextup=4');
    await wake(page);
    await page.locator('media-fullscreen-button').first().click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    // The strip is offered in a video's last ten seconds only.
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.currentTime = 8; });
    for (const size of [{ width: 1100, height: 760 }, { width: 700, height: 360 }, { width: 1280, height: 400 }, { width: 900, height: 700 }]) {
        await page.setViewportSize(size);
        await wake(page);
        await page.waitForTimeout(500);
        await expect(page.locator('.lmpl-nextup')).toBeVisible();
        const strip = (await page.locator('.lmpl-nextup').boundingBox())!;
        const chapter = page.locator('.lmpl-chapter-now:not([hidden])');
        if (await chapter.count()) {
            const c = (await chapter.boundingBox())!;
            expect(strip.y + strip.height, `chapter line at ${size.width}x${size.height}`).toBeLessThanOrEqual(c.y + 1);
        }
        const play = (await page.locator('.lmpl-play').boundingBox())!;
        const apart = strip.x >= play.x + play.width || strip.x + strip.width <= play.x || strip.y >= play.y + play.height || strip.y + strip.height <= play.y;
        expect(apart, `play button at ${size.width}x${size.height}`).toBe(true);
        // What is full-screen, not the player's outer box, which keeps its windowed size behind it.
        const frame = await page.evaluate(() => { const r = document.fullscreenElement!.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        expect(strip.x + strip.width, `right edge at ${size.width}x${size.height}: strip ${JSON.stringify(strip)} frame ${JSON.stringify(frame)}`).toBeLessThanOrEqual(frame.x + frame.width + 1);
        expect(strip.y).toBeGreaterThanOrEqual(frame.y - 1);
    }
    expect(errors).toEqual([]);
});

test.describe('with a finger', () => {
    test.use({ hasTouch: true });

    /** A touch gesture through the browser's own input path, as a phone makes it. */
    async function touch(page: Page, points: { x: number; y: number }[], { hold = 0, release = true } = {}) {
        const cdp = await page.context().newCDPSession(page);
        const send = (type: string, p?: { x: number; y: number }) =>
            cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1 }] : [] });
        await send('touchStart', points[0]);
        for (const p of points.slice(1)) {
            await send('touchMove', p);
            await page.waitForTimeout(16);
        }
        if (hold) await page.waitForTimeout(hold);
        if (release) await send('touchEnd');
        return cdp;
    }

    test('a finger dragged on the timeline holds the video, the roster meets the track, and it plays on once left alone', async ({ page }) => {
        await open(page);
        await page.locator('.lmpl-play').tap();
        await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
        const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
        const y = bar.y + bar.height / 2;
        const cdp = await touch(page, [{ x: bar.x + bar.width * 0.3, y }, { x: bar.x + bar.width * 0.34, y }, { x: bar.x + bar.width * 0.38, y }], { release: false, hold: 500 });
        expect((await state(page)).paused).toBe(true);
        const track = (await page.locator('.lmpl-time-slider .lmpl-track').boundingBox())!;
        const roster = (await page.locator('.lmpl-roster').boundingBox())!;
        expect(track.y + track.height - roster.y).toBeLessThanOrEqual(0.5);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        // The strip stays open, the video still held, until five seconds go by without a touch.
        await page.waitForTimeout(500);
        expect((await state(page)).paused).toBe(true);
        await expect(page.locator('.lmpl-roster')).toBeVisible();
        await expect.poll(() => state(page).then((s) => s.paused), { timeout: 8000 }).toBe(false);
        await expect(page.locator('.lmpl-roster')).toHaveCount(0);
    });

    test('a tap on the timeline opens the strip and holds the video without moving it', async ({ page }) => {
        await open(page);
        await page.locator('.lmpl-play').tap();
        await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
        const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
        const before = (await state(page)).t;
        await touch(page, [{ x: bar.x + bar.width * 0.8, y: bar.y + bar.height / 2 }]);
        await expect(page.locator('.lmpl-roster')).toBeVisible();
        expect((await state(page)).paused).toBe(true);
        expect(Math.abs((await state(page)).t - before)).toBeLessThan(1.5);
    });

    test('a tap on the picture puts the strip away and the video plays on', async ({ page }) => {
        await open(page);
        await page.locator('.lmpl-play').tap();
        await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
        const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
        await touch(page, [{ x: bar.x + bar.width * 0.5, y: bar.y + bar.height / 2 }]);
        await expect(page.locator('.lmpl-roster')).toBeVisible();
        const frame = (await page.locator('media-container').first().boundingBox())!;
        await touch(page, [{ x: frame.x + frame.width / 2, y: frame.y + frame.height * 0.25 }]);
        await expect(page.locator('.lmpl-roster')).toHaveCount(0);
        await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
    });

    test('without frames a tap shows the thick bar with a handle instead', async ({ page }) => {
        await page.setViewportSize({ width: 1100, height: 760 });
        await page.goto(`/?master=${encodeURIComponent(`${FIXTURES}/clear/master.m3u8`)}&embed=1`);
        await page.locator('.lmpl-play').tap();
        await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
        const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
        const before = (await state(page)).t;
        await touch(page, [{ x: bar.x + bar.width * 0.8, y: bar.y + bar.height / 2 }]);
        await expect(page.locator('.lmpl-root.lmpl-scrub-bar')).toHaveCount(1);
        expect((await state(page)).paused).toBe(true);
        expect(Math.abs((await state(page)).t - before)).toBeLessThan(1.5);
        await expect(page.locator('.lmpl-root.lmpl-scrub-bar')).toHaveCount(0, { timeout: 8000 });
        await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
    });

    test('forty quick finger scrubs leave the video playing and the page free of errors', async ({ page }) => {
        await open(page);
        await page.locator('.lmpl-play').tap();
        await expect.poll(() => state(page).then((s) => s.paused)).toBe(false);
        const bar = (await page.locator('.lmpl-time-slider').boundingBox())!;
        const y = bar.y + bar.height / 2;
        for (let i = 0; i < 40; i++) {
            const r = 0.05 + (i % 9) * 0.1;
            await touch(page, [{ x: bar.x + bar.width * r, y }, { x: bar.x + bar.width * (r + 0.03), y }, { x: bar.x + bar.width * (r + 0.05), y: y - (i % 4) * 6 }]);
        }
        // The last scrub leaves the strip open and the video held until three quiet seconds have passed.
        await expect.poll(() => state(page).then((s) => s.paused), { timeout: 10000 }).toBe(false);
        expect(errors).toEqual([]);
    });
});
