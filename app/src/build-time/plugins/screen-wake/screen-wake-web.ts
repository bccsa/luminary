import type { ScreenWakeService } from "@/build-time/contracts/screen-wake/contract";

/** Browser {@link ScreenWakeService}: the display follows the OS idle timeout. */
export class WebScreenWakeService implements ScreenWakeService {
    setKeepAwake(): void {
        // The browser build leaves display sleep to the OS.
    }
}
