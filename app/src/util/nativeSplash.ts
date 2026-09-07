/**
 * Dismiss the native splash screen once the web UI is ready to paint (or has
 * failed and is showing an error): startup does significant async work before
 * mounting, and without an explicit hide the user stares at a blank webview.
 *
 * Uses the runtime-injected bridge global so this is a no-op in regular
 * browsers and when the splash plugin isn't packaged.
 */
export function hideNativeSplash(): void {
    const splash = (
        window as unknown as {
            Capacitor?: { Plugins?: { SplashScreen?: { hide?: () => Promise<void> } } };
        }
    ).Capacitor?.Plugins?.SplashScreen;
    splash?.hide?.().catch(() => undefined);
}
