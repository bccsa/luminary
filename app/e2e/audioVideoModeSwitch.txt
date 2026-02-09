import { test as base, chromium, expect } from "@playwright/test";

async function waitForExpect(
    assertion: () => void | Promise<void>,
    timeout = 30000,
    interval = 100,
): Promise<void> {
    const startTime = Date.now();
    let lastError: any;

    while (Date.now() - startTime < timeout) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise((res) => setTimeout(res, interval));
        }
    }

    throw lastError;
}

const test = base.extend({
    // eslint-disable-next-line no-empty-pattern
    context: async ({}, use) => {
        const context = await chromium.launchPersistentContext("", {
            headless: true,
            locale: "en",
            // Grant permissions for autoplay
            permissions: ["camera", "microphone"],
        });
        await use(context);
        await context.close();
    },
});

test.describe("Audio/Video Mode Switching", () => {
    test.beforeEach(async ({ context }) => {
        const page = await context.newPage();
        await page.goto("/", { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);

        // Find a video content page from IndexedDB
        const videoContentSlug = await page.evaluate(async () => {
            return new Promise<string | null>((resolve) => {
                const dbRequest = indexedDB.open("luminary-db");
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const transaction = db.transaction("docs", "readonly");
                    const objectStore = transaction.objectStore("docs");

                    const request = objectStore.getAll();
                    request.onsuccess = () => {
                        const docs = request.result;
                        // Find first content with a video URL
                        const videoContent = docs.find(
                            (doc: any) =>
                                doc.type === "content" &&
                                doc.video &&
                                !doc.video.includes("youtube"),
                        );
                        resolve(videoContent?.slug || null);
                    };
                };
                dbRequest.onerror = () => resolve(null);
            });
        });

        test.skip(!videoContentSlug, "No video content found in database");

        // Navigate to the video content page
        await page.goto(`/${videoContentSlug}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000); // Wait for player to initialize

        await context.close();
    });

    test("can switch from video mode to audio mode", async ({ context }) => {
        const page = await context.newPage();
        await page.goto("/", { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);

        // Find a video content page
        const videoContentSlug = await page.evaluate(async () => {
            return new Promise<string | null>((resolve) => {
                const dbRequest = indexedDB.open("luminary-db");
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const transaction = db.transaction("docs", "readonly");
                    const objectStore = transaction.objectStore("docs");
                    const request = objectStore.getAll();
                    request.onsuccess = () => {
                        const docs = request.result;
                        const videoContent = docs.find(
                            (doc: any) =>
                                doc.type === "content" &&
                                doc.video &&
                                !doc.video.includes("youtube"),
                        );
                        resolve(videoContent?.slug || null);
                    };
                };
                dbRequest.onerror = () => resolve(null);
            });
        });

        test.skip(!videoContentSlug, "No video content found in database");

        await page.goto(`/${videoContentSlug}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);

        // Wait for the audio/video toggle button to be visible
        const toggleButton = page.locator('[data-test="audio-video-toggle"]');
        await waitForExpect(async () => {
            expect(await toggleButton.isVisible()).toBe(true);
        });

        // Get initial state (should be video mode)
        const isInitiallyAudioMode = await page.evaluate(() => {
            const player = document.querySelector("video");
            return player?.classList.contains("vjs-audio-only-mode") || false;
        });
        expect(isInitiallyAudioMode).toBe(false);

        // Click to switch to audio mode
        await toggleButton.click();
        await page.waitForTimeout(1000);

        // Verify audio mode is active
        await waitForExpect(async () => {
            const isAudioMode = await page.evaluate(() => {
                const player = document.querySelector("video");
                return player?.classList.contains("vjs-audio-only-mode") || false;
            });
            expect(isAudioMode).toBe(true);
        });

        // Verify the player is playing or ready to play
        await waitForExpect(async () => {
            const playerState = await page.evaluate(() => {
                const video = document.querySelector("video");
                return {
                    paused: video?.paused,
                    readyState: (video as any)?.readyState,
                };
            });
            // ReadyState should be at least HAVE_CURRENT_DATA (2) or playing
            expect(playerState.readyState).toBeGreaterThanOrEqual(2);
        }, 5000);
    });

    test("can switch from audio mode back to video mode", async ({ context }) => {
        const page = await context.newPage();
        await page.goto("/", { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);

        const videoContentSlug = await page.evaluate(async () => {
            return new Promise<string | null>((resolve) => {
                const dbRequest = indexedDB.open("luminary-db");
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const transaction = db.transaction("docs", "readonly");
                    const objectStore = transaction.objectStore("docs");
                    const request = objectStore.getAll();
                    request.onsuccess = () => {
                        const docs = request.result;
                        const videoContent = docs.find(
                            (doc: any) =>
                                doc.type === "content" &&
                                doc.video &&
                                !doc.video.includes("youtube"),
                        );
                        resolve(videoContent?.slug || null);
                    };
                };
                dbRequest.onerror = () => resolve(null);
            });
        });

        test.skip(!videoContentSlug, "No video content found in database");

        await page.goto(`/${videoContentSlug}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);

        const toggleButton = page.locator('[data-test="audio-video-toggle"]');
        await waitForExpect(async () => {
            expect(await toggleButton.isVisible()).toBe(true);
        });

        // Switch to audio mode first
        await toggleButton.click();
        await page.waitForTimeout(1000);

        await waitForExpect(async () => {
            const isAudioMode = await page.evaluate(() => {
                const player = document.querySelector("video");
                return player?.classList.contains("vjs-audio-only-mode") || false;
            });
            expect(isAudioMode).toBe(true);
        });

        // Now switch back to video mode
        await toggleButton.click();
        await page.waitForTimeout(1000);

        // Verify video mode is active
        await waitForExpect(async () => {
            const isAudioMode = await page.evaluate(() => {
                const player = document.querySelector("video");
                return player?.classList.contains("vjs-audio-only-mode") || false;
            });
            expect(isAudioMode).toBe(false);
        });

        // Verify the player is playing or ready to play
        await waitForExpect(async () => {
            const playerState = await page.evaluate(() => {
                const video = document.querySelector("video");
                return {
                    paused: video?.paused,
                    readyState: (video as any)?.readyState,
                };
            });
            expect(playerState.readyState).toBeGreaterThanOrEqual(2);
        }, 5000);
    });

    test("preserves selected audio channel when switching modes", async ({ context }) => {
        const page = await context.newPage();
        await page.goto("/", { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);

        const videoContentSlug = await page.evaluate(async () => {
            return new Promise<string | null>((resolve) => {
                const dbRequest = indexedDB.open("luminary-db");
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const transaction = db.transaction("docs", "readonly");
                    const objectStore = transaction.objectStore("docs");
                    const request = objectStore.getAll();
                    request.onsuccess = () => {
                        const docs = request.result;
                        const videoContent = docs.find(
                            (doc: any) =>
                                doc.type === "content" &&
                                doc.video &&
                                !doc.video.includes("youtube"),
                        );
                        resolve(videoContent?.slug || null);
                    };
                };
                dbRequest.onerror = () => resolve(null);
            });
        });

        test.skip(!videoContentSlug, "No video content found in database");

        await page.goto(`/${videoContentSlug}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);

        // Get the initially selected audio track
        const initialAudioTrack = await page.evaluate(() => {
            const video = document.querySelector("video") as any;
            if (!video || !video.audioTracks) return null;
            const tracks = video.audioTracks();
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].enabled) {
                    return {
                        language: tracks[i].language,
                        label: tracks[i].label,
                    };
                }
            }
            return null;
        });

        test.skip(!initialAudioTrack, "No audio tracks available");
        if (!initialAudioTrack) return;

        const toggleButton = page.locator('[data-test="audio-video-toggle"]');
        await waitForExpect(async () => {
            expect(await toggleButton.isVisible()).toBe(true);
        });

        // Switch to audio mode
        await toggleButton.click();
        await page.waitForTimeout(1500);

        // Get audio track in audio mode
        const audioModeTrack = await page.evaluate(() => {
            const video = document.querySelector("video") as any;
            if (!video || !video.audioTracks) return null;
            const tracks = video.audioTracks();
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].enabled) {
                    return {
                        language: tracks[i].language,
                        label: tracks[i].label,
                    };
                }
            }
            return null;
        });

        // Verify the track is the same in audio mode
        expect(audioModeTrack?.language).toBe(initialAudioTrack.language);

        // Switch back to video mode
        await toggleButton.click();
        await page.waitForTimeout(1500);

        // Get audio track after switching back
        const finalAudioTrack = await page.evaluate(() => {
            const video = document.querySelector("video") as any;
            if (!video || !video.audioTracks) return null;
            const tracks = video.audioTracks();
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].enabled) {
                    return {
                        language: tracks[i].language,
                        label: tracks[i].label,
                    };
                }
            }
            return null;
        });

        // Verify the track is still the same after switching back
        expect(finalAudioTrack?.language).toBe(initialAudioTrack.language);
    });

    test("preserves selected audio channel when entering fullscreen", async ({ context }) => {
        const page = await context.newPage();
        await page.goto("/", { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);

        const videoContentSlug = await page.evaluate(async () => {
            return new Promise<string | null>((resolve) => {
                const dbRequest = indexedDB.open("luminary-db");
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const transaction = db.transaction("docs", "readonly");
                    const objectStore = transaction.objectStore("docs");
                    const request = objectStore.getAll();
                    request.onsuccess = () => {
                        const docs = request.result;
                        const videoContent = docs.find(
                            (doc: any) =>
                                doc.type === "content" &&
                                doc.video &&
                                !doc.video.includes("youtube"),
                        );
                        resolve(videoContent?.slug || null);
                    };
                };
                dbRequest.onerror = () => resolve(null);
            });
        });

        test.skip(!videoContentSlug, "No video content found in database");

        await page.goto(`/${videoContentSlug}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);

        // Get the initially selected audio track
        const initialAudioTrack = await page.evaluate(() => {
            const video = document.querySelector("video") as any;
            if (!video || !video.audioTracks) return null;
            const tracks = video.audioTracks();
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].enabled) {
                    return {
                        language: tracks[i].language,
                        label: tracks[i].label,
                    };
                }
            }
            return null;
        });

        test.skip(!initialAudioTrack, "No audio tracks available");
        if (!initialAudioTrack) return;

        // Request fullscreen
        await page.evaluate(() => {
            const player = document.querySelector("video") as any;
            if (player && player.requestFullscreen) {
                player.requestFullscreen();
            }
        });

        await page.waitForTimeout(1000);

        // Get audio track in fullscreen
        const fullscreenTrack = await page.evaluate(() => {
            const video = document.querySelector("video") as any;
            if (!video || !video.audioTracks) return null;
            const tracks = video.audioTracks();
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].enabled) {
                    return {
                        language: tracks[i].language,
                        label: tracks[i].label,
                    };
                }
            }
            return null;
        });

        // Verify the track persisted in fullscreen
        expect(fullscreenTrack?.language).toBe(initialAudioTrack.language);

        // Exit fullscreen
        await page.keyboard.press("Escape");
        await page.waitForTimeout(1000);

        // Get audio track after exiting fullscreen
        const afterFullscreenTrack = await page.evaluate(() => {
            const video = document.querySelector("video") as any;
            if (!video || !video.audioTracks) return null;
            const tracks = video.audioTracks();
            for (let i = 0; i < tracks.length; i++) {
                if (tracks[i].enabled) {
                    return {
                        language: tracks[i].language,
                        label: tracks[i].label,
                    };
                }
            }
            return null;
        });

        // Verify the track still persists
        expect(afterFullscreenTrack?.language).toBe(initialAudioTrack.language);
    });

    test("audio mode starts playing quickly without long delays", async ({ context }) => {
        const page = await context.newPage();
        await page.goto("/", { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);

        const videoContentSlug = await page.evaluate(async () => {
            return new Promise<string | null>((resolve) => {
                const dbRequest = indexedDB.open("luminary-db");
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const transaction = db.transaction("docs", "readonly");
                    const objectStore = transaction.objectStore("docs");
                    const request = objectStore.getAll();
                    request.onsuccess = () => {
                        const docs = request.result;
                        const videoContent = docs.find(
                            (doc: any) =>
                                doc.type === "content" &&
                                doc.video &&
                                !doc.video.includes("youtube"),
                        );
                        resolve(videoContent?.slug || null);
                    };
                };
                dbRequest.onerror = () => resolve(null);
            });
        });

        test.skip(!videoContentSlug, "No video content found in database");

        await page.goto(`/${videoContentSlug}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);

        const toggleButton = page.locator('[data-test="audio-video-toggle"]');
        await waitForExpect(async () => {
            expect(await toggleButton.isVisible()).toBe(true);
        });

        // Measure time to switch to audio mode
        const startTime = Date.now();
        await toggleButton.click();

        // Wait for audio mode to be active and player ready
        await waitForExpect(
            async () => {
                const playerState = await page.evaluate(() => {
                    const video = document.querySelector("video") as any;
                    const isAudioMode = video?.classList.contains("vjs-audio-only-mode");
                    const readyState = video?.readyState || 0;
                    return { isAudioMode, readyState };
                });

                expect(playerState.isAudioMode).toBe(true);
                expect(playerState.readyState).toBeGreaterThanOrEqual(2);
            },
            3000,
            100,
        );

        const timeToReady = Date.now() - startTime;

        // Verify it took less than 3 seconds to be ready
        expect(timeToReady).toBeLessThan(3000);
        console.log(`Audio mode switch took ${timeToReady}ms`);
    });
});
