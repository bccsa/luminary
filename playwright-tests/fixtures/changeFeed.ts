import type { Page } from "@playwright/test";

/** Matches the API's SSE live-update endpoint, with or without its query string. */
export const LIVE_STREAM = /\/live(\?|$)/;

/**
 * Makes every change feed short-lived: the first event (the `clientConfig`) is read from the real
 * API and replayed, then the stream ends. The client sees a dropped connection and reconnects with
 * whatever credentials it holds by then — the way a network blip would. Playwright cannot hold open
 * and later close a plain HTTP stream, so this stands in for closing a WebSocket.
 *
 * Install before the first navigation.
 */
export async function useShortLivedChangeFeed(page: Page): Promise<void> {
    await page.route(LIVE_STREAM, async (route) => {
        const request = route.request();
        const headers = { ...request.headers() };
        for (const name of ["host", "content-length", "accept-encoding", "connection"]) {
            delete headers[name];
        }

        const controller = new AbortController();
        try {
            const res = await fetch(request.url(), {
                headers,
                signal: controller.signal,
            });
            const responseHeaders = Object.fromEntries(
                [...res.headers.entries()].filter(
                    ([name]) =>
                        !["content-length", "content-encoding", "transfer-encoding"].includes(name),
                ),
            );

            // Errors (e.g. a 401 for a stale token) pass through unchanged
            if (!res.ok || !res.body) {
                await route.fulfill({
                    status: res.status,
                    headers: responseHeaders,
                    body: await res.text(),
                });
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let body = "";
            while (!body.includes("\n\n")) {
                const { done, value } = await reader.read();
                if (done) break;
                body += decoder.decode(value, { stream: true });
            }
            controller.abort();
            await route.fulfill({ status: 200, headers: responseHeaders, body });
        } catch {
            await route.abort("connectionfailed");
        }
    });
}
