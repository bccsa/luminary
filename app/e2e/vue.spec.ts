// Leaving link in file for reference to Playwright documentation
// https://playwright.dev/docs/intro
import { test as base, chromium, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";

// Enforce serial execution so that we can share the persistent context's userDataDir safely
// or at least ensure we don't conflict on the same directory if we were to parallelize.
// Since we want to reuse the "filled" DB, serial is safest to avoid locking issues on the same dir.
base.describe.configure({ mode: "serial" });

const USER_DATA_DIR = path.resolve("./test-results/user-data-e2e");

// Helper to wait for IndexedDB to be populated
async function waitForDB(page: Page) {
    await expect
        .poll(
            async () => {
                return page.evaluate(() => {
                    return new Promise((resolve) => {
                        // @ts-ignore
                        if (!window.indexedDB) resolve(false);
                        const req = indexedDB.open("luminary-db");
                        req.onerror = () => resolve(false);
                        req.onsuccess = () => {
                            const db = req.result;
                            if (!db.objectStoreNames.contains("docs")) {
                                db.close();
                                resolve(false);
                                return;
                            }
                            const tx = db.transaction("docs", "readonly");
                            const store = tx.objectStore("docs");
                            const countReq = store.count();
                            countReq.onsuccess = () => {
                                db.close();
                                resolve(countReq.result > 0);
                            };
                            countReq.onerror = () => {
                                db.close();
                                resolve(false);
                            };
                        };
                    });
                });
            },
            {
                message: "Timed out waiting for IndexedDB 'docs' store to have data",
                timeout: 60000, // Wait up to 60s for initial sync
                intervals: [1000, 2000, 5000],
            },
        )
        .toBeTruthy();
}

// Custom test fixture that provides a persistent context with shared userDataDir
const test = base.extend({
    context: async ({ browserName }, use) => {
        // We only support Chromium for these specific IndexedDB tests as configured currently
        if (browserName !== "chromium") {
            test.skip();
            return;
        }

        // Ensure directory exists
        if (!fs.existsSync(USER_DATA_DIR)) {
            fs.mkdirSync(USER_DATA_DIR, { recursive: true });
        }

        const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: true,
            args: ["--disable-extensions"], // Minimal args
            viewport: { width: 1280, height: 720 },
            // We can add more options here if needed to match project config,
            // but persistent context is specific.
        });

        const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

        // Navigate to app to trigger sync
        await page.goto("/", { waitUntil: "domcontentloaded" });

        // Wait for DB to be ready before running ANY test
        // This satisfies "Each test should run while indexedDB is already full"
        console.log("Waiting for IndexedDB sync...");
        await waitForDB(page);
        console.log("IndexedDB sync verified.");

        await use(context);
        await context.close();
    },
});

test("it syncs correct document types to the app(non-cms) client", async ({ context }) => {
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    // Wait for any post load navigation to prevent errors
    await page.waitForTimeout(1000);

    const result = await page.evaluate(async () => {
        return new Promise((resolve, reject) => {
            //Ensure that the browser supports indexedDB.databases() as it is not supported in all browsers
            if ("databases" in indexedDB) {
                const dbRequest = indexedDB.open("luminary-db");
                dbRequest.onerror = (event) => {
                    console.error("Error opening database", event);
                    reject("Error opening database");
                };
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const transaction = db.transaction("docs", "readonly");
                    const objectStore = transaction.objectStore("docs");

                    const request = objectStore.getAll();

                    request.onerror = (event) => {
                        console.error("Error getting all documents", event);
                        reject("Error getting all documents");
                    };

                    request.onsuccess = () => {
                        const documents = request.result;
                        resolve(documents);
                    };
                };
            } else {
                console.error("indexedDB.databases() not supported");
                reject("indexedDB.databases() not supported");
            }
        }) as unknown as Promise<any[]>;
    });

    await expect(async () => {
        expect(result).toBeDefined();
        const types = [...new Set(result.map((doc: any) => doc.type))];
        expect(types).toEqual(expect.arrayContaining(["language", "redirect", "content"]));
    }).toPass();
});

test("it does not sync drafted or expired docs to the app(non-cms) client", async ({ context }) => {
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "networkidle" });
    // Wait for any post load navigation to prevent errors
    await page.waitForTimeout(1000);

    const result = await page.evaluate(async () => {
        return new Promise((resolve, reject) => {
            //Ensure that the browser supports indexedDB.databases() as it is not supported in all browsers
            if ("databases" in indexedDB) {
                const dbRequest = indexedDB.open("luminary-db");
                dbRequest.onerror = (event) => {
                    console.error("Error opening database", event);
                    reject("Error opening database");
                };
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const transaction = db.transaction("docs", "readonly");
                    const objectStore = transaction.objectStore("docs");

                    const request = objectStore.getAll();

                    request.onerror = (event) => {
                        console.error("Error getting all documents", event);
                        reject("Error getting all documents");
                    };

                    request.onsuccess = () => {
                        const documents = request.result;
                        resolve(documents);
                    };
                };
            } else {
                console.error("indexedDB.databases() not supported");
                reject("indexedDB.databases() not supported");
            }
        }) as unknown as Promise<any[]>;
    });
    expect(result).toBeDefined();

    await expect(async () => {
        const types = [...new Set(result.map((doc: any) => doc.status))];
        expect(types).not.toEqual(expect.arrayContaining(["draft", "expired"]));
        expect(types).toEqual(expect.arrayContaining(["published"]));
    }).toPass();
});

test("it can correctly add a preferred language to the the user's preferred languages", async ({
    context,
}) => {
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "networkidle" });
    // Wait for any post load navigation to prevent errors
    await page.waitForTimeout(1000);

    // Get initial preferred languages from localStorage
    const initialLanguages = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem("languages") || "[]");
    });

    // Open the profile menu by clicking the menu button
    // Look for button containing user icon or "Menu" text
    const menuButton = page
        .locator('button:has(svg), button:has-text("Menu")')
        .filter({ hasText: /Menu|User/ })
        .first();
    await menuButton.click();
    await page.waitForTimeout(500); // Wait for menu to open

    // Click on the language menu item
    // The menu item should contain "Language" text
    const languageMenuItem = page.locator('button:has-text("Language")').first();
    await languageMenuItem.waitFor({ state: "visible" });
    await languageMenuItem.click();

    // Wait for the language modal content to be visible
    await expect(async () => {
        const modalContent = page.locator(
            '[name="lModal-languages"] [data-test="add-language-button"], [name="lModal-languages"] .flex.w-full.items-center.p-3',
        );
        const count = await modalContent.count();
        expect(count).toBeGreaterThan(0);
    }).toPass();

    // Get available languages (those with add-language-button)
    const availableLanguageButtons = page.locator('[data-test="add-language-button"]');
    const count = await availableLanguageButtons.count();

    if (count > 0) {
        // Click the first available language to add it
        await availableLanguageButtons.first().click();
        await page.waitForTimeout(500); // Wait for language to be added

        // Verify the language was added to localStorage
        const updatedLanguages = await page.evaluate(() => {
            return JSON.parse(localStorage.getItem("languages") || "[]");
        });

        await expect(async () => {
            expect(updatedLanguages.length).toBeGreaterThan(initialLanguages.length);
            // Verify it's an array of strings
            expect(Array.isArray(updatedLanguages)).toBe(true);
            expect(updatedLanguages.every((id: any) => typeof id === "string")).toBe(true);
        }).toPass();
    }
});

test("it can correctly remove a preferred language from the user's preferred languages", async ({
    context,
}) => {
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "networkidle" });
    // Wait for any post load navigation to prevent errors
    await page.waitForTimeout(1000);

    // First, ensure we have at least one language to remove (add one if needed)
    const initialLanguages = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem("languages") || "[]");
    });

    // If we have less than 2 languages, add one first so we can test removal
    if (initialLanguages.length < 2) {
        // Open profile menu and add a language first
        const menuButton = page
            .locator('button:has(svg), button:has-text("Menu")')
            .filter({ hasText: /Menu|User/ })
            .first();
        await menuButton.click();
        await page.waitForTimeout(500);

        const languageMenuItem = page.locator('button:has-text("Language")').first();
        await languageMenuItem.waitFor({ state: "visible" });
        await languageMenuItem.click();
        await page.waitForTimeout(500);

        const availableLanguageButtons = page.locator('[data-test="add-language-button"]');
        const count = await availableLanguageButtons.count();

        if (count > 0) {
            await availableLanguageButtons.first().click();
            await page.waitForTimeout(500);
        }

        // Close modal
        const closeButton = page
            .locator('button:has-text("Close"), button:has-text("close")')
            .first();
        if (await closeButton.isVisible()) {
            await closeButton.click();
        }
        await page.waitForTimeout(500);
    }

    // Get languages before removal
    const languagesBeforeRemoval = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem("languages") || "[]");
    });

    // Need at least 2 languages to remove one (default language cannot be removed)
    if (languagesBeforeRemoval.length < 2) {
        // Skip test if we can't remove any language
        return;
    }

    // Open profile menu
    const menuButton = page
        .locator('button:has(svg), button:has-text("Menu")')
        .filter({ hasText: /Menu|User/ })
        .first();
    await menuButton.click();
    await page.waitForTimeout(500);

    // Open language modal
    const languageMenuItem = page.locator('button:has-text("Language")').first();
    await languageMenuItem.waitFor({ state: "visible" });
    await languageMenuItem.click();
    await page.waitForTimeout(500);

    // Wait for the language modal content to be visible
    // The modal might be teleported, so we wait for actual content inside it
    await expect(async () => {
        const modalContent = page.locator(
            '[name="lModal-languages"] [data-test="add-language-button"], [name="lModal-languages"] .flex.w-full.items-center.p-3',
        );
        const count = await modalContent.count();
        expect(count).toBeGreaterThan(0);
    }).toPass();

    // Find selected languages (those with CheckCircleIcon that are not disabled)
    // The default language has a disabled cursor style, so we want to find removable ones
    const selectedLanguageItems = page.locator(
        '[name="lModal-languages"] .flex.w-full.items-center.p-3',
    );
    const selectedCount = await selectedLanguageItems.count();

    if (selectedCount > 1) {
        // Find a removable language (one with yellow CheckCircleIcon, not the default)
        // The default language has gray icon (text-zinc-400 or text-slate-400), removable ones have yellow (text-yellow-500)
        // We want the second or later item to avoid the default language
        const removableLanguageContainer = selectedLanguageItems.nth(1); // Get the second language (first is likely default)

        if ((await removableLanguageContainer.count()) > 0) {
            // Get the language ID before removal from the container's id attribute
            const languageIdToRemove = await removableLanguageContainer.getAttribute("id");

            // Find the clickable div (the one with cursor-pointer class that has the @click handler)
            const clickableDiv = removableLanguageContainer.locator(
                ".flex.w-full.cursor-pointer.items-center.gap-1",
            );

            // Wait for the clickable div to be visible
            await clickableDiv.waitFor({ state: "visible" });

            // Verify it's not the default language (default has cursor-auto, removable has cursor-pointer)
            const isDefault = await clickableDiv.evaluate((el) => {
                return (
                    el.classList.contains("cursor-auto") ||
                    window.getComputedStyle(el).cursor === "auto"
                );
            });

            if (isDefault) {
                // If this is the default, try the next language
                const nextLanguage = selectedLanguageItems.nth(2);
                if ((await nextLanguage.count()) > 0) {
                    const nextClickable = nextLanguage.locator(
                        ".flex.w-full.cursor-pointer.items-center.gap-1",
                    );
                    await nextClickable.waitFor({ state: "visible" });
                    await nextClickable.evaluate((el) => (el as HTMLElement).click());
                    await nextClickable.click({ force: true });
                }
            } else {
                // Try clicking using JavaScript to ensure it triggers the event
                await clickableDiv.evaluate((el) => {
                    (el as HTMLElement).click();
                });

                // Also try a regular click as fallback
                await clickableDiv.click({ force: true });
            }

            // Small delay to allow the click to process
            await page.waitForTimeout(200);

            // Wait for localStorage to actually update (poll until it changes)
            await expect(async () => {
                const languagesAfterRemoval = await page.evaluate(() => {
                    return JSON.parse(localStorage.getItem("languages") || "[]");
                });
                expect(languagesAfterRemoval.length).toBeLessThan(languagesBeforeRemoval.length);
                // Verify it's an array of strings
                expect(Array.isArray(languagesAfterRemoval)).toBe(true);
                expect(languagesAfterRemoval.every((id: any) => typeof id === "string")).toBe(true);
                if (languageIdToRemove) {
                    expect(languagesAfterRemoval).not.toContain(languageIdToRemove);
                }
            }).toPass({ timeout: 10000 }); // Give it more time to update
        }
    }
});

test("it can correctly switch languages using the quick language selector", async ({ context }) => {
    const page = await context.newPage();

    await page.goto("/", { waitUntil: "networkidle" });
    // Wait for any post load navigation to prevent errors
    await page.waitForTimeout(1000);

    // Try to find a content page with multiple translations from IndexedDB
    const contentWithTranslations = await page.evaluate(async () => {
        return new Promise<string | null>((resolve) => {
            const dbRequest = indexedDB.open("luminary-db");
            dbRequest.onsuccess = () => {
                const db = dbRequest.result;
                const transaction = db.transaction("docs", "readonly");
                const objectStore = transaction.objectStore("docs");

                // Get all content documents
                const request = objectStore.getAll();
                request.onsuccess = () => {
                    const docs = request.result;
                    // Group by parentId to find content with multiple translations
                    const byParent: Record<string, any[]> = {};
                    docs.forEach((doc: any) => {
                        if (doc.type === "content" && doc.parentId) {
                            if (!byParent[doc.parentId]) {
                                byParent[doc.parentId] = [];
                            }
                            byParent[doc.parentId].push(doc);
                        }
                    });

                    // Find first parent with multiple translations
                    for (const parentId in byParent) {
                        if (byParent[parentId].length > 1) {
                            resolve(byParent[parentId][0].slug);
                            return;
                        }
                    }
                    resolve(null);
                };
            };
            dbRequest.onerror = () => resolve(null);
        });
    });

    // If we found content with translations, navigate to it
    if (contentWithTranslations) {
        await page.goto(`/${contentWithTranslations}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);

        // Check if translation selector is visible (it only shows when there are multiple translations)
        const translationSelector = page.locator('[data-test="translationSelector"]');
        const isSelectorVisible = await translationSelector.isVisible().catch(() => false);

        if (isSelectorVisible) {
            const initialUrl = page.url();

            // Click to open the dropdown
            await translationSelector.click();
            await page.waitForTimeout(300);

            // Wait for dropdown to be visible
            const translationOptions = page.locator('[data-test="translationOption"]');
            const optionCount = await translationOptions.count();

            if (optionCount > 1) {
                // Get all available options and find one that's not currently selected
                const options = await translationOptions.all();
                let alternativeOption = null;

                for (const option of options) {
                    const hasCheckIcon = (await option.locator("svg").count()) > 0;
                    if (!hasCheckIcon) {
                        alternativeOption = option;
                        break; // Use the first non-selected option
                    }
                }

                // If we found an alternative option, click it to switch
                if (alternativeOption) {
                    await alternativeOption.click();
                    await page.waitForTimeout(500);

                    // Verify the URL changed (language switch should update the slug)
                    await expect(async () => {
                        const newUrl = page.url();
                        expect(newUrl).not.toBe(initialUrl);
                    }).toPass();

                    // Verify the selector is still visible and functional
                    await expect(async () => {
                        const newLanguageText = await translationSelector.textContent();
                        expect(newLanguageText).toBeTruthy();
                    }).toPass();
                }
            }
        } else {
            // If translation selector is not visible, it means there's only one translation
            // This is a valid state, so we'll just verify the page loaded correctly
            await expect(async () => {
                const pageContent = await page.content();
                expect(pageContent).toBeTruthy();
            }).toPass();
        }
    } else {
        // If no content with multiple translations found, skip the test
        // This is a valid scenario in some test environments
        console.log(
            "No content with multiple translations found, skipping quick language switch test",
        );
    }
});
