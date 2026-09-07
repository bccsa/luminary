/**
 * Show/hide the native status bar (time, battery, signal) in step with the
 * mobile chrome, so reading pages get the full screen while scrolled in.
 *
 * Uses the runtime-injected bridge global so this is a no-op in regular
 * browsers and when the status-bar plugin isn't packaged.
 */
export function setNativeStatusBarHidden(hidden: boolean): void {
    const statusBar = (
        window as unknown as {
            Capacitor?: {
                Plugins?: {
                    StatusBar?: {
                        hide?: (opts?: { animation?: string }) => Promise<void>;
                        show?: (opts?: { animation?: string }) => Promise<void>;
                    };
                };
            };
        }
    ).Capacitor?.Plugins?.StatusBar;
    if (!statusBar) return;

    const call = hidden
        ? statusBar.hide?.({ animation: "FADE" })
        : statusBar.show?.({ animation: "FADE" });
    call?.catch(() => undefined);
}
