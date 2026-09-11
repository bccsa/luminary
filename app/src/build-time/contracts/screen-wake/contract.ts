/** Whether the device display may dim and lock while the app is in use. */
export type ScreenWakeService = {
    /**
     * Hold the display on, or hand it back to the OS idle timeout. No-op where the
     * platform offers no control over it.
     */
    setKeepAwake(keepAwake: boolean): void;
};
