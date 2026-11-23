import { shallowRef, type App, type ShallowRef } from "vue";
import { AppPromoKey } from "@/build-time/contracts/app-promo/token";
import type { AppPromoService } from "@/build-time/contracts/app-promo/contract";

const holders = new WeakMap<App, ShallowRef<AppPromoService | undefined>>();

/**
 * Provides an empty promotion service under `AppPromoKey`. Consumers inject once at setup and installation can land
 * after mount, so what they get is a holder that a later {@link provideAppPromo} fills in place. Safe to call more
 * than once.
 */
export function provideAppPromoHolder(app: App): void {
    if (holders.has(app)) return;
    const current = shallowRef<AppPromoService>();
    holders.set(app, current);
    app.provide(AppPromoKey, {
        component: (placement) => current.value?.component(placement),
    });
}

/** Fills the app's holder with a build target's promotion service; placements already rendered update. */
export function provideAppPromo(app: App, service: AppPromoService): void {
    provideAppPromoHolder(app);
    holders.get(app)!.value = service;
}
