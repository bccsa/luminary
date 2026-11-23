import { computed, inject, shallowRef, type ComputedRef, type InjectionKey } from "vue";
import type { DownloadsService } from "./contract";

export const DownloadsKey: InjectionKey<DownloadsService> = Symbol("DownloadsService");

/**
 * The service a build target provided. Its engine can answer after the app has mounted, so components set up before
 * then follow this rather than what was injected at their setup.
 */
export const providedDownloads = shallowRef<DownloadsService | undefined>(undefined);

/** The downloads service, undefined until (and unless) a build target provides one. */
export function useDownloads(): ComputedRef<DownloadsService | undefined> {
    const injected = inject(DownloadsKey, undefined);
    return computed(() => injected ?? providedDownloads.value);
}
