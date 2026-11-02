import { expect, test, type Page } from '@playwright/test';

// The control layout is v10's own; the Video.js 8 player has different chrome.
test.skip(process.env.ENGINE !== 'v10', 'controls specific to the Video.js 10 player');

const FIXTURES = `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 5191}`;
const STORAGE_KEY = 'luminary-legacy-player-demo';

const KEY_HEX = '00112233445566778899aabbccddeeff';
const NATIVE_KEY = '6c756d696e6172792d737069a4e2c0de';

async function open(
    page: Page,
    { bare = false, fixture = 'clear', key = '', thumbs = false }: { bare?: boolean; fixture?: string; key?: string; thumbs?: boolean } = {}
) {
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [STORAGE_KEY, { bare }] as const);
    const params = `master=${encodeURIComponent(`${FIXTURES}/${fixture}/master.m3u8`)}&embed=1${key ? `&key=${key}` : ''}${thumbs ? '&thumbs=1' : '&thumbs=0'}`;
    await page.goto(`/?${params}`);
    await expect(page.locator('.lmpl-root video, .lmpl-root hlsjs-video').first()).toBeAttached();
    // Loaded before any of it is poked at: a duration, and data to play from. A seek made before the first
    // segment is appended is dropped by WebKit, which is the engine's business, not the controls'.
    await expect.poll(() => time(page).then((t) => t.duration), { timeout: 15_000 }).toBeGreaterThan(5);
    await expect
        .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 })
        .toBeGreaterThanOrEqual(3);
    // The sidecar is fetched (and, on an encrypted session, decrypted) after the player is ready. The preview is
    // rightly off until there are frames, so a test that hovers sooner is hovering before there is anything to show.
    if (thumbs) await expect(page.locator('.lmpl-root.lmpl-has-thumbs')).toBeAttached({ timeout: 15_000 });
}

const time = (page: Page) =>
    page.locator('video').evaluate((v: HTMLVideoElement) => ({ current: v.currentTime, duration: v.duration, paused: v.paused }));

const controlsVisible = (page: Page) => page.locator('media-controls-content').evaluate((el) => el.hasAttribute('data-visible'));

const wake = async (page: Page) => {
    const box = (await page.locator('.lmpl-root').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5);
};

test('every media-* element in the controls is a registered element, not an inert tag', async ({ page }) => {
    await open(page);
    const undefinedTags = await page.evaluate(() => {
        const tags = new Set<string>();
        for (const el of document.querySelectorAll('.lmpl-root *')) {
            if (el.localName.startsWith('media-') || el.localName.startsWith('video-') || el.localName === 'hlsjs-video') tags.add(el.localName);
        }
        return [...tags].filter((tag) => !customElements.get(tag));
    });
    expect(undefinedTags).toEqual([]);
});

test('the centre button plays and pauses', async ({ page }) => {
    await open(page);
    await wake(page);
    await page.locator('.lmpl-play').click();
    await expect.poll(() => time(page).then((t) => t.paused)).toBe(false);
    await wake(page);
    await page.locator('.lmpl-play').click();
    await expect.poll(() => time(page).then((t) => t.paused)).toBe(true);
});

test('the skip buttons move the playhead by ten seconds, and stop at the ends', async ({ page }) => {
    await open(page);
    await wake(page);
    await page.locator('.lmpl-seek-forward').click();
    await expect.poll(() => time(page).then((t) => Math.round(t.current))).toBe(10);
    await wake(page);
    await page.locator('.lmpl-seek-back').click();
    await expect.poll(() => time(page).then((t) => Math.round(t.current))).toBe(0);
    await wake(page);
    await page.locator('.lmpl-seek-back').click();
    await expect.poll(() => time(page).then((t) => t.current)).toBeGreaterThanOrEqual(0);
});

test('the skip buttons flank the play button, which is centred', async ({ page }) => {
    await open(page);
    await wake(page);
    const rect = async (sel: string) => (await page.locator(sel).boundingBox())!;
    const frame = (await page.locator('.lmpl-root').boundingBox())!;
    const [back, play, forward] = [await rect('.lmpl-seek-back'), await rect('.lmpl-play'), await rect('.lmpl-seek-forward')];
    const centre = (b: { x: number; width: number }) => b.x + b.width / 2;
    expect(Math.abs(centre(play) - (frame.x + frame.width / 2))).toBeLessThan(2);
    expect(Math.abs(centre(forward) - centre(play) - (centre(play) - centre(back)))).toBeLessThan(2);
    expect(back.x + back.width).toBeLessThan(play.x);
    expect(play.x + play.width).toBeLessThan(forward.x);
    expect(play.width).toBeGreaterThan(back.width);
});

test('the settings sit under the timeline, and the remote group sits with fullscreen', async ({ page }) => {
    await open(page);
    await wake(page);
    const rect = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    const timeline = await rect('.lmpl-timeline-row');
    const frame = await rect('.lmpl-root');
    const quality = await rect('.lmpl-opt-quality');
    const speed = await rect('.lmpl-opt-speed');
    const remote = await rect('.lmpl-remote');
    const fullscreen = await rect('media-fullscreen-button');
    // Under the bar, on its left; no cogwheel anywhere.
    expect(quality.y).toBeGreaterThan(timeline.y + timeline.height - 2);
    expect(speed.y).toBeGreaterThan(timeline.y + timeline.height - 2);
    expect(quality.x - frame.x).toBeLessThan(frame.width / 2);
    expect(await page.locator('.lmpl-settings, .lmpl-cluster-top').count()).toBe(0);
    // Fullscreen is in the remote group, on the right of the same row, and the group ends with it.
    expect(remote.x - frame.x).toBeGreaterThan(frame.width / 2);
    expect(Math.abs(remote.y + remote.height / 2 - (fullscreen.y + fullscreen.height / 2))).toBeLessThan(2);
    expect(fullscreen.x + fullscreen.width).toBeLessThanOrEqual(remote.x + remote.width + 1);
    expect(fullscreen.x).toBeGreaterThanOrEqual(remote.x);
    // Casting and picture-in-picture are nowhere but there (Chromium hides them with nothing to reach, so the
    // check is where they sit, not that they show).
    const stray = await page.locator('.lmpl-root media-pip-button, .lmpl-root media-cast-button, .lmpl-root media-airplay-button').evaluateAll(
        (els) => els.filter((el) => el.closest('.lmpl-remote') === null).length
    );
    expect(stray).toBe(0);
});

test('the buttons under the timeline form one even run, with no gap between the volume and the settings', async ({ page }) => {
    await open(page, { fixture: 'native', key: NATIVE_KEY });
    await wake(page);
    const boxes = await page.evaluate(() => {
        const row = document.querySelector('.lmpl-actions-row')!;
        return [...row.querySelectorAll('.lmpl-mute, .lmpl-opt')]
            .filter((e) => (e as HTMLElement).offsetParent !== null)
            .map((e) => ({ x: e.getBoundingClientRect().x, w: e.getBoundingClientRect().width }));
    });
    expect(boxes.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < boxes.length; i++) {
        const gap = boxes[i]!.x - (boxes[i - 1]!.x + boxes[i - 1]!.w);
        // A few pixels between neighbours: a 22px gap between the volume and the next button read as a hole.
        expect(gap, `gap before button ${i}`).toBeLessThanOrEqual(6);
    }
});

test('only the settings with a choice to make are offered', async ({ page }) => {
    await open(page);
    await wake(page);
    // Two renditions and no languages or captions: quality and speed, and nothing that would do nothing.
    await expect(page.locator('.lmpl-opt-quality')).toBeVisible();
    await expect(page.locator('.lmpl-opt-speed')).toBeVisible();
    await expect(page.locator('.lmpl-opt-audio')).toBeHidden();
    await expect(page.locator('.lmpl-opt-captions')).toBeHidden();
});

/** The demo's own audio selector, which follows the player's idea of the active track. */
const demoAudio = (page: Page) =>
    page.evaluate(() => {
        for (const label of document.querySelectorAll('label')) {
            if (label.firstChild?.textContent?.trim() !== 'Audio') continue;
            const select = label.querySelector('select')!;
            return select.selectedOptions[0]?.textContent?.trim() ?? '';
        }
        return null;
    });

test.describe('language selector, on the native sample stream: four languages, two angles, encrypted', () => {
    test('is offered, and lists every language', async ({ page }) => {
        await open(page, { fixture: 'native', key: NATIVE_KEY });
        await wake(page);
        const button = page.locator('.lmpl-opt-audio');
        await expect(button).toBeVisible();
        await button.click();
        const card = page.locator('.lmpl-card-audio');
        await expect(card).toBeVisible();
        await expect(card.locator('.lmpl-card-title')).toHaveText('Language');
        const labels = await card.locator('media-menu-radio-item').allTextContents();
        expect(labels.map((l) => l.trim())).toEqual(['English', 'Español', 'Français', 'Deutsch']);
    });

    test('marks the language that is playing, and switching moves the player to the one chosen', async ({ page }) => {
        await open(page, { fixture: 'native', key: NATIVE_KEY });
        await wake(page);
        await expect.poll(() => demoAudio(page)).toBe('English');
        await page.locator('.lmpl-opt-audio').click();
        const items = page.locator('.lmpl-card-audio media-menu-radio-item');
        await expect(items.first()).toHaveAttribute('aria-checked', 'true');
        await items.nth(3).click();
        await expect.poll(() => demoAudio(page)).toBe('Deutsch');
        // And the card agrees with the player on its next opening.
        await wake(page);
        await page.locator('.lmpl-opt-audio').click();
        await expect(items.nth(3)).toHaveAttribute('aria-checked', 'true');
        await expect(items.first()).toHaveAttribute('aria-checked', 'false');
    });

    test('keeps playing in the new language', async ({ page }) => {
        await open(page, { fixture: 'native', key: NATIVE_KEY });
        await page.locator('video').evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
        await expect.poll(() => time(page).then((t) => t.current), { timeout: 20_000 }).toBeGreaterThan(1);
        await wake(page);
        await page.locator('.lmpl-opt-audio').click();
        await page.locator('.lmpl-card-audio media-menu-radio-item').nth(1).click();
        const before = (await time(page)).current;
        await expect.poll(() => time(page).then((t) => t.current), { timeout: 20_000 }).toBeGreaterThan(before + 2);
        expect(await demoAudio(page)).toBe('Español');
    });

    test('is not offered when the stream has a single language', async ({ page }) => {
        await open(page);
        await wake(page);
        await expect(page.locator('.lmpl-opt-audio')).toBeHidden();
    });
});

test('the volume is a card over the mute button: plus, a thick slider, minus', async ({ page }) => {
    await open(page);
    await wake(page);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.volume = 0.5; v.muted = false; });
    await page.locator('.lmpl-mute').hover();
    await expect(page.locator('.lmpl-volume-card')).toBeVisible();
    const volume = () => page.locator('video').evaluate((v: HTMLVideoElement) => Math.round(v.volume * 100) / 100);
    await page.locator('[data-volume-step="1"]').click();
    await expect.poll(volume).toBe(0.6);
    await page.locator('[data-volume-step="-1"]').click();
    await page.locator('[data-volume-step="-1"]').click();
    await expect.poll(volume).toBe(0.4);
    // Above the slider, and below it.
    const plus = (await page.locator('[data-volume-step="1"]').boundingBox())!;
    const slider = (await page.locator('.lmpl-volume-slider').boundingBox())!;
    const minus = (await page.locator('[data-volume-step="-1"]').boundingBox())!;
    expect(plus.y + plus.height).toBeLessThanOrEqual(slider.y + 1);
    expect(slider.y + slider.height).toBeLessThanOrEqual(minus.y + 1);
    // Not the sliver the skin's default draws.
    const track = (await page.locator('.lmpl-vtrack').boundingBox())!;
    expect(track.width).toBeGreaterThanOrEqual(12);
});

test('plus on a muted player unmutes it, and the volume stops at the top', async ({ page }) => {
    await open(page);
    await wake(page);
    // Driven through the player's element, as its own controls do, and read back off the picture's.
    await page.locator('hlsjs-video').evaluate((el: HTMLVideoElement) => { el.volume = 0.95; el.muted = true; });
    await page.locator('.lmpl-mute').hover();
    await page.locator('[data-volume-step="1"]').click();
    await expect.poll(() => page.locator('hlsjs-video').evaluate((el: HTMLVideoElement) => ({ m: el.muted, v: Math.round(el.volume * 100) / 100 }))).toEqual({ m: false, v: 1 });
    await page.locator('[data-volume-step="1"]').click();
    expect(await page.locator('hlsjs-video').evaluate((el: HTMLVideoElement) => el.volume)).toBe(1);
});

test('the volume fill covers the whole width of its track, not half', async ({ page }) => {
    await open(page);
    await wake(page);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.volume = 0.6; v.muted = false; });
    await page.locator('.lmpl-mute').hover();
    await expect(page.locator('.lmpl-volume-card')).toBeVisible();
    // The skin sets a horizontal fill's pseudo-element to `left: 0` and leaves a vertical one to its
    // static position, half a track-width in: a fill that painted half the bar.
    const box = await page.locator('.lmpl-vfill').evaluate((el) => {
        const before = getComputedStyle(el, '::before');
        // Computed, not measured: the card scales in as it opens, and a bounding box would read it mid-animation.
        return { left: parseFloat(before.left), width: parseFloat(before.width), track: parseFloat(getComputedStyle(el.parentElement!).width) };
    });
    expect(box.left).toBe(0);
    expect(box.width).toBe(box.track);
});

test('the timeline fill is white and follows the playhead', async ({ page }) => {
    await open(page);
    await wake(page);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.currentTime = 6; });
    await wake(page);
    await expect.poll(() => page.locator('.lmpl-fill').evaluate((el) => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width)).toBeGreaterThan(0.45);
    expect(await page.locator('.lmpl-fill').evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(255, 255, 255)');
});

test('the controls grow with a large player, so a desktop fullscreen is not drawn at phone size', async ({ page }) => {
    const sizes = async (width: number) => {
        await page.setViewportSize({ width, height: Math.round(width * 0.62) });
        await page.goto(`/?master=${encodeURIComponent(`${FIXTURES}/clear/master.m3u8`)}&embed=1&thumbs=0`);
        // The demo page holds the player to a column; a fullscreen player is the width of the screen.
        await page.addStyleTag({ content: 'main.demo { max-width: none !important; padding: 0 !important; } .lmpl-root { border-radius: 0 !important; }' });
        await expect.poll(() => time(page).then((t) => t.duration), { timeout: 15_000 }).toBeGreaterThan(5);
        // The scale follows the player's width, so wait for the page to have settled at that width (and a
        // couple of frames for the container query to apply) before reading anything off it.
        await expect.poll(() => page.locator('.lmpl-root').evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(width * 0.85);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await wake(page);
        return page.evaluate(() => {
            const w = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().width;
            const frame = document.querySelector('.lmpl-root')!.getBoundingClientRect();
            return { play: w('.lmpl-play'), button: w('.lmpl-mute'), track: parseFloat(getComputedStyle(document.querySelector('.lmpl-track')!).height), edge: document.querySelector('.lmpl-timeline-row')!.getBoundingClientRect().x - frame.x };
        });
    };
    const small = await sizes(430);
    const large = await sizes(2000);
    expect(large.play).toBeGreaterThan(small.play * 1.4);
    expect(large.button).toBeGreaterThan(small.button * 1.4);
    expect(large.track).toBeGreaterThan(small.track * 1.4);
    // And it stands well in from the edges, where a stray touch is likelier: a phone's margin on a 2000px
    // screen is the bug this guards against (a container query on the player's parent never applied).
    expect(small.edge).toBeLessThan(40);
    expect(large.edge).toBeGreaterThanOrEqual(100);
});

test('the timeline is thick and round, with no thumb', async ({ page }) => {
    await open(page);
    await wake(page);
    expect(await page.locator('.lmpl-time-slider media-slider-thumb').count()).toBe(0);
    const track = await page.locator('.lmpl-track').evaluate((el) => {
        const s = getComputedStyle(el);
        return { height: parseFloat(s.height), radius: parseFloat(s.borderTopLeftRadius) };
    });
    expect(track.height).toBeGreaterThanOrEqual(10);
    expect(track.radius).toBeGreaterThanOrEqual(track.height / 2);
});

test('the timeline keeps well in from both edges, so a stray touch at the screen edge cannot seek', async ({ page }) => {
    await open(page);
    await wake(page);
    const frame = (await page.locator('.lmpl-root').boundingBox())!;
    const row = (await page.locator('.lmpl-timeline-row').boundingBox())!;
    expect(row.x - frame.x).toBeGreaterThanOrEqual(40);
    expect(frame.x + frame.width - (row.x + row.width)).toBeGreaterThanOrEqual(40);
});

test('a setting opens as a solid card with no blur, close above its button', async ({ page }) => {
    await open(page);
    await wake(page);
    const button = page.locator('.lmpl-opt-quality');
    await button.click();
    const card = page.locator('.lmpl-card-quality');
    await expect(card).toBeVisible();
    const css = await card.evaluate((el) => {
        const s = getComputedStyle(el);
        return { backdrop: s.backdropFilter || s.getPropertyValue('-webkit-backdrop-filter'), filter: s.filter };
    });
    expect(['none', '']).toContain(css.backdrop);
    // `blur(0px)` is what the skin's hidden-state variable resolves to when set to nothing: no blur.
    expect(['none', 'blur(0px)']).toContain(css.filter);
    // Above the button, and near it: the skin's default floats a menu far enough off to look detached.
    // The card slides in as it opens; measure once it has settled.
    await expect
        .poll(async () => {
            const b = (await button.boundingBox())!;
            const c = (await card.boundingBox())!;
            return Math.round(b.y - (c.y + c.height));
        })
        .toBeGreaterThanOrEqual(0);
    const b = (await button.boundingBox())!;
    const c = (await card.boundingBox())!;
    expect(b.y - (c.y + c.height)).toBeLessThan(14);
});

test('the controls go away three seconds after the last movement', async ({ page }) => {
    await open(page);
    await page.locator('video').evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
    await wake(page);
    await expect.poll(() => controlsVisible(page)).toBe(true);
    const moved = Date.now();
    // Still up after 2 s — v10's own idle time — so the three-second hide is ours.
    await page.waitForTimeout(2300);
    expect(await controlsVisible(page)).toBe(true);
    await expect.poll(() => controlsVisible(page), { timeout: 3000 }).toBe(false);
    const elapsed = Date.now() - moved;
    expect(elapsed).toBeGreaterThanOrEqual(2800);
    expect(elapsed).toBeLessThan(4200);
});

test('a bare frame shows no controls and answers no clicks while windowed', async ({ page }) => {
    await open(page, { bare: true });
    await wake(page);
    expect(await page.locator('.lmpl-controls').evaluate((el) => getComputedStyle(el).display)).toBe('none');
    const box = (await page.locator('.lmpl-root').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    expect((await time(page)).paused).toBe(true);
});

test('a clicked picture plays and pauses when the controls are on', async ({ page }) => {
    await open(page);
    const box = (await page.locator('.lmpl-root').boundingBox())!;
    // Off the controls: the top right is the picture.
    await page.mouse.click(box.x + box.width - 60, box.y + 80);
    await expect.poll(() => time(page).then((t) => t.paused)).toBe(false);
});

test('there is no audio/video toggle in the player', async ({ page }) => {
    await open(page);
    expect(await page.locator('.lmpl-av-toggle').count()).toBe(0);
});

// ---------------------------------------------------------------------------------------------
// Scrub thumbnails: `thumbnails.vtt` beside the master, one frame a second, five to a row of a
// 160×90 sheet. A hover at ratio r over the 12 s clip names cue floor(12r).
// ---------------------------------------------------------------------------------------------

const sliderBox = async (page: Page) => (await page.locator('.lmpl-time-slider').boundingBox())!;

/** Where the hovered frame sits on the sheet: the crop `ScrubThumbnail` offsets its background by. */
const frameCrop = (page: Page) =>
    page.locator('.lmpl-thumb-frame').evaluate((el) => (el as HTMLElement).style.backgroundPosition);

// A zero is written `0px`, not `-0px`: that is how the browser reads the style back.
const px = (n: number) => (n === 0 ? '0px' : `-${n}px`);
const cropFor = (second: number) => `${px((second % 5) * 160)} ${px(Math.floor(second / 5) * 90)}`;

async function hoverAt(page: Page, ratio: number) {
    const bar = await sliderBox(page);
    await page.mouse.move(bar.x + bar.width * ratio, bar.y + bar.height / 2);
}

test.describe('scrub thumbnails', () => {
    test('show the frame under the pointer, with its time', async ({ page }) => {
        await open(page, { thumbs: true });
        await wake(page);
        await hoverAt(page, 0.5);
        await expect(page.locator('.lmpl-scrub-preview')).toBeVisible();
        await expect.poll(() => frameCrop(page)).toBe(cropFor(6));
        // Either side of the second: each engine reports the clip a hair differently long (12.08 s, 12.16 s).
        await expect(page.locator('.lmpl-thumb-time')).toHaveText(/^0:0[56]$/);
    });

    test('follow the pointer along the bar', async ({ page }) => {
        await open(page, { thumbs: true });
        await wake(page);
        await hoverAt(page, 0.1);
        await expect.poll(() => frameCrop(page)).toBe(cropFor(1));
        const first = (await page.locator('.lmpl-scrub-preview').boundingBox())!;
        await hoverAt(page, 0.9);
        await expect.poll(() => frameCrop(page)).toBe(cropFor(10));
        const last = (await page.locator('.lmpl-scrub-preview').boundingBox())!;
        expect(last.x).toBeGreaterThan(first.x + 200);
    });

    test('still show a frame at the very end of the bar', async ({ page }) => {
        await open(page, { thumbs: true });
        await wake(page);
        // The far right is where an end-exclusive cue range would match nothing.
        await hoverAt(page, 1);
        await expect(page.locator('.lmpl-thumb-frame')).toBeVisible();
        await expect.poll(() => frameCrop(page)).toBe(cropFor(11));
        await expect(page.locator('.lmpl-thumb-time')).toHaveText(/^0:1[12]$/);
    });

    test('stay inside the frame at both ends of the bar', async ({ page }) => {
        await open(page, { thumbs: true });
        await wake(page);
        const frame = (await page.locator('.lmpl-root').boundingBox())!;
        for (const ratio of [0, 1]) {
            await hoverAt(page, ratio);
            const box = (await page.locator('.lmpl-thumb-box').boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(frame.x);
            expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width);
        }
    });

    test('go away when the pointer leaves the bar', async ({ page }) => {
        await open(page, { thumbs: true });
        await wake(page);
        await hoverAt(page, 0.5);
        await expect(page.locator('.lmpl-scrub-preview')).toBeVisible();
        const bar = await sliderBox(page);
        await page.mouse.move(bar.x + bar.width / 2, bar.y - 120);
        await expect(page.locator('.lmpl-scrub-preview')).toBeHidden();
    });

    test('stay up while dragging, even with the pointer off the bar, and the drag seeks', async ({ page }) => {
        await open(page, { thumbs: true });
        await wake(page);
        const bar = await sliderBox(page);
        await page.mouse.move(bar.x + bar.width * 0.2, bar.y + bar.height / 2);
        await page.mouse.down();
        await page.mouse.move(bar.x + bar.width * 0.7, bar.y - 150, { steps: 6 });
        await expect(page.locator('.lmpl-scrub-preview')).toBeVisible();
        await expect.poll(() => frameCrop(page)).toBe(cropFor(8));
        await page.mouse.up();
        await expect.poll(() => time(page).then((t) => Math.round(t.current))).toBeGreaterThanOrEqual(7);
        await expect(page.locator('.lmpl-scrub-preview')).toBeHidden();
    });

    test('work for an encrypted session, whose thumbnails.vtt is wrapped like every other', async ({ page }) => {
        await open(page, { fixture: 'encrypted', key: KEY_HEX, thumbs: true });
        await wake(page);
        await hoverAt(page, 0.5);
        await expect.poll(() => frameCrop(page)).toBe(cropFor(6));
    });

    test('replace the plain time readout, which would otherwise stack on them', async ({ page }) => {
        await open(page, { thumbs: true });
        await wake(page);
        await hoverAt(page, 0.5);
        await expect(page.locator('.lmpl-preview')).toBeHidden();
    });

    test('leave the plain time readout alone when there are none', async ({ page }) => {
        await open(page, { thumbs: false });
        await wake(page);
        await hoverAt(page, 0.5);
        await expect(page.locator('.lmpl-scrub-preview')).toHaveCount(0);
        await expect(page.locator('.lmpl-preview')).toBeVisible();
    });

    test('are not drawn on a bare windowed frame, which has no timeline', async ({ page }) => {
        await open(page, { thumbs: true, bare: true });
        const box = (await page.locator('.lmpl-root').boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height - 30);
        await expect(page.locator('.lmpl-scrub-preview')).toHaveCount(0);
    });
});
