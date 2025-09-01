/**
 * UpdateManager handles automatic updates so we don't disrupt the user experience.
 *
 * All updates are treated as critical and applied automatically at the most appropriate moment.
 *
 * Features:
 * - Periodic update checks every 2 hours
 * - Automatic update application during user inactivity (30 seconds of no interaction - only checks if there actually is an update)
 * - Smart timing to avoid interrupting active work sessions
 * - Preserves SPA experience with intelligent update scheduling
 */
export default class UpdateManager {
    /** Service Worker registration instance */
    private registration: ServiceWorkerRegistration | null = null;

    /** Flag indicating if an update is available and ready to be applied */
    private updateAvailable = false;

    /** Time in milliseconds to wait for inactivity before applying update (default: 30 seconds) */
    private readonly inactivityDelay = 30000;

    /** Timer for inactivity detection */
    private inactivityTimer: NodeJS.Timeout | null = null;

    /** Array of event types that indicate user activity */
    private readonly activityEvents = [
        "mousedown",
        "mousemove",
        "keypress",
        "scroll",
        "touchstart",
        "click",
    ];

    /**
     * Initializes the UpdateManager by registering the service worker and setting up
     * periodic update checks.
     *
     * @throws {Error} If service worker registration fails
     */
    async init() {
        if ("serviceWorker" in navigator) {
            this.registration = await navigator.serviceWorker.register("/sw.js");
            this.registration.addEventListener("updatefound", this.onUpdateFound.bind(this));

            // Check for updates periodically every 2 hours (7200000ms)
            setInterval(() => this.checkForUpdates(), 7200000);
        }
    }

    /**
     * Handles the 'updatefound' event when a new service worker is being installed.
     * Treats all updates as critical and applies them during the next period of user inactivity.
     *
     * @private
     */
    private onUpdateFound() {
        const newWorker = this.registration?.installing;
        if (newWorker) {
            newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed") {
                    this.updateAvailable = true;

                    // Only start activity monitoring when an update is actually available
                    this.setupActivityMonitoring();
                    this.scheduleUpdate();
                }
            });
        }
    }

    /**
     * Sets up activity monitoring to detect when the user becomes inactive.
     * Only called when an update is available to avoid unnecessary event listeners.
     *
     * @private
     */
    private setupActivityMonitoring() {
        const resetInactivityTimer = () => {
            if (this.inactivityTimer) {
                clearTimeout(this.inactivityTimer);
            }

            if (this.updateAvailable) {
                this.inactivityTimer = setTimeout(() => {
                    this.applyUpdate();
                }, this.inactivityDelay);
            }
        };

        // Listen for all user activity events
        this.activityEvents.forEach((eventType) => {
            document.addEventListener(eventType, resetInactivityTimer, { passive: true });
        });

        // Start the initial timer
        resetInactivityTimer();
    }

    /**
     * Schedules the update to be applied at the next optimal moment.
     *
     * All updates will be applied when:
     * - The user becomes inactive for 30+ seconds (this behavior only happens if an update is available)
     * - The user switches to another tab/window
     * - The user navigates away from the site
     *
     * @private
     */
    private scheduleUpdate() {
        // Apply update when user switches tabs or minimizes window
        document.addEventListener("visibilitychange", () => {
            if (document.hidden && this.updateAvailable) {
                this.applyUpdate();
            }
        });

        // Apply update when user navigates away from the page (leaves the site entirely)
        window.addEventListener("beforeunload", () => {
            if (this.updateAvailable) {
                this.applyUpdate();
            }
        });
    }

    /**
     * Applies the pending update by activating the new service worker and reloading the page.
     *
     * This method:
     * 1. Sends a message to the waiting service worker to skip waiting and take control
     * 2. Reloads the current page to use the updated assets
     *
     * @private
     */
    private applyUpdate() {
        this.registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
        window.location.reload();
    }

    /**
     * Manually checks for service worker updates.
     *
     * This method is called automatically every 2 hours, but can also be called
     * manually if needed. It triggers the service worker to check for new versions
     * of the app.
     *
     * @returns Promise that resolves when the update check is complete
     */
    async checkForUpdates() {
        await this.registration?.update();
    }
}
